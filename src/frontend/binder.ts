import * as ast from "./ast.ts";
import * as astUtils from "./astUtils.ts";
import { Program } from "./program.ts";
import { walkAst, walkAstChildren } from "./walkAst.ts";
import { bool, nameof } from "../shims.ts";
import { Mutable } from "../utils.ts";
import { Symbol, SymbolFlags, SymbolScope, SymbolTable } from "./symbols.ts";

// TODO: bind should use Result<BinderResult, BinderError>.
export function bind(program: Program) {
  bindInitialize(program);

  for (const sourceFile of Object.values(program.sourceFiles)) {
    bindSourceFile(program, <Required<ast.SourceFile>> sourceFile);
  }
}

const SYMBOL_SCOPE_SYNTAX_KIND = [
  ast.SyntaxKind.SourceFile,
  ast.SyntaxKind.FunctionDeclaration,
  ast.SyntaxKind.StatementBlock,
];

function bindInitialize(program: Program) {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    (<Mutable<ast.SourceFile>> sourceFile).locals = {};
    (<Mutable<ast.SourceFile>> sourceFile).exports = {};

    walkAstChildren(sourceFile, (node: ast.SyntaxNode, parent: ast.SyntaxNode): bool => {
      (node as Mutable<ast.SyntaxNode>).parent = parent;

      if (SYMBOL_SCOPE_SYNTAX_KIND.includes(node.kind)) {
        const scope = <SymbolScope> node;
        (<Mutable<SymbolScope>> scope).locals = {};

        const nextSymbolScope = getParentNodeByKinds<Required<SymbolScope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);
        (<Mutable<SymbolScope>> scope).nextSymbolScope = nextSymbolScope;
      }

      return true;
    });
  }
}

function getParentNodeByKinds<T>(node: ast.SyntaxNode, kinds: ast.SyntaxKind[]): T {
  if (node.parent == null) {
    throw new Error(`${ast.SyntaxKind[node.kind]} node has no parent.`);
  }

  node = node.parent;
  while (!kinds.includes(node.kind) && node.parent != null) {
    node = node.parent;
  }

  if (!kinds.includes(node.kind)) {
    throw new Error(`Failed to get parent node of ${kinds.map((x) => ast.SyntaxKind[x]).join(", ")}.`);
  }

  return <T> node;
}

function getSymbolScopeFromNode(node: ast.SyntaxNode): Required<SymbolScope> {
  return getParentNodeByKinds<Required<SymbolScope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);
}

function getSymbolByName(scope: Required<SymbolScope>, name: string): Symbol {
  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      return scope.locals[name];
    }
    scope = <Required<SymbolScope>> scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    return scope.locals[name];
  }

  throw new Error(`Failed to get symbol named "${name}".`);
}

function bindSourceFile(program: Program, sourceFile: Required<ast.SourceFile>): void {
  walkAst(sourceFile, (node: ast.SyntaxNode): bool => {
    // TODO: All the cases in the switch should return false that binding only occurs once.
    switch (node.kind) {
      case ast.SyntaxKind.ImportDeclaration:
        bindImportDeclaration(program, sourceFile, <ast.ImportDeclaration> node);
        return false;

      case ast.SyntaxKind.EnumDeclaration:
        bindEnumDeclaration(program, sourceFile, <ast.EnumDeclaration> node);
        return false;

      case ast.SyntaxKind.FunctionDeclaration:
        bindFunctionDeclaration(program, sourceFile, <ast.FunctionDeclaration> node);
        return true;

      case ast.SyntaxKind.StructDeclaration:
        bindStructDeclaration(program, sourceFile, <ast.StructDeclaration> node);
        return false;

      case ast.SyntaxKind.VariableDeclaration:
        bindVariableDeclaration(program, sourceFile, <ast.VariableDeclaration> node);
        return false;

      case ast.SyntaxKind.PropertyAccessExpression:
        bindPropertyAccessExpression(program, sourceFile, <ast.PropertyAccessExpression> node);
        return true;

      case ast.SyntaxKind.Identifier:
        bindIdentifier(program, sourceFile, <ast.Identifier> node);
        return false;

      // Just ignoring types for now.
      case ast.SyntaxKind.TypeReference:
        return false;
    }

    return true;
  });
}

function bindImportDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  importStatement: ast.ImportDeclaration,
): void {
  const moduleAlias = astUtils.getOrCalculateModuleAlias(importStatement);
  const members = program.sourceFiles[importStatement.resolvedFileName].exports;

  (<Mutable<ast.ImportDeclaration>> importStatement).symbol = {
    sourceFileName: sourceFile.fileName,
    name: moduleAlias,
    flags: SymbolFlags.Module,
    members,
  };

  sourceFile.locals[moduleAlias] = importStatement.symbol!;
}

function bindEnumDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  enumDeclaration: ast.EnumDeclaration,
): void {
  const members: SymbolTable = {};
  for (const enumMember of enumDeclaration.members) {
    bindEnumMember(program, sourceFile, enumMember);
    members[enumMember.symbol!.name] = enumMember.symbol!;
  }

  (<Mutable<ast.EnumDeclaration>> enumDeclaration).symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumDeclaration.name.value,
    flags: SymbolFlags.Enum,
    members,
  };

  sourceFile.locals[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  if (enumDeclaration.isExported) {
    sourceFile.exports[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  }
}

function bindEnumMember(program: Program, sourceFile: Required<ast.SourceFile>, enumMember: ast.EnumMember): void {
  (<Mutable<ast.EnumMember>> enumMember).symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumMember.name.value,
    flags: SymbolFlags.EnumMember,
  };
}

function bindFunctionDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  functionDeclaration: ast.FunctionDeclaration,
): void {
  (<Mutable<ast.FunctionDeclaration>> functionDeclaration).symbol = {
    sourceFileName: sourceFile.fileName,
    name: functionDeclaration.name.value,
    flags: SymbolFlags.Function,
  };

  sourceFile.locals[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  if (functionDeclaration.isExported) {
    sourceFile.exports[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  }
}

function bindStructDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  structDeclaration: ast.StructDeclaration,
): void {
  const members: SymbolTable = {};
  for (const structMember of structDeclaration.members) {
    bindStructMember(program, sourceFile, structMember);
    members[structMember.symbol!.name] = structMember.symbol!;
  }

  (<Mutable<ast.StructDeclaration>> structDeclaration).symbol = {
    sourceFileName: sourceFile.fileName,
    name: structDeclaration.name.value,
    flags: SymbolFlags.Variable,
    members,
  };

  sourceFile.locals[structDeclaration.symbol!.name] = structDeclaration.symbol!;
  if (structDeclaration.isExported) {
    sourceFile.exports[structDeclaration.name.value] = structDeclaration.symbol!;
  }
}

function bindStructMember(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  structMember: ast.StructMember,
): void {
  (<Mutable<ast.StructMember>> structMember).symbol = {
    sourceFileName: sourceFile.fileName,
    name: structMember.name.value,
    flags: SymbolFlags.StructMember,
  };
}

function bindVariableDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  variableDeclaration: ast.VariableDeclaration,
): void {
  let members: SymbolTable | undefined;

  if (variableDeclaration.type.kind == ast.SyntaxKind.TypeReference) {
    const typeReference = <ast.TypeReference> variableDeclaration.type;
    if (typeReference.typeName.kind == ast.SyntaxKind.QualifiedName) {
      const qualifiedName = <ast.QualifiedName> typeReference.typeName;

      const scope = getSymbolScopeFromNode(variableDeclaration);
      const module = getSymbolByName(scope, qualifiedName.left.value);

      // TODO: Check members is set

      const moduleExport = module.members![qualifiedName.right.value];

      // TODO: Check members is set.

      members = moduleExport.members;
    } else {
      const identifier = <ast.Identifier> typeReference.typeName;

      // HACK: Ignore int32 for now.
      if (identifier.value != "int32") {
        const scope = getSymbolScopeFromNode(variableDeclaration);
        const symbol = getSymbolByName(scope, identifier.value);

        members = symbol.members;
      }
    }
  }

  (<Mutable<ast.VariableDeclaration>> variableDeclaration).symbol = {
    sourceFileName: sourceFile.fileName,
    name: variableDeclaration.name.value,
    flags: SymbolFlags.Variable,
    members,
  };

  const scope = getSymbolScopeFromNode(variableDeclaration);
  scope.locals[variableDeclaration.symbol!.name] = variableDeclaration.symbol!;
}

function bindPropertyAccessExpression(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  let lhsSymbol: Symbol | undefined;

  if (propertyAccessExpression.expression.kind == ast.SyntaxKind.Identifier) {
    const leftIdentifier = <ast.Identifier> propertyAccessExpression.expression;
    bindIdentifier(program, sourceFile, leftIdentifier);
    lhsSymbol = leftIdentifier.symbol;
  } else if (propertyAccessExpression.expression.kind == ast.SyntaxKind.PropertyAccessExpression) {
    const leftPropertyAccessExpression = <ast.PropertyAccessExpression> propertyAccessExpression.expression;
    bindPropertyAccessExpression(program, sourceFile, leftPropertyAccessExpression);
    lhsSymbol = leftPropertyAccessExpression.symbol;
  } else {
    throw new Error(
      `Unexpected lhs expression in ${nameof(bindPropertyAccessExpression)}: ${
        ast.SyntaxKind[propertyAccessExpression.expression.kind]
      }`,
    );
  }

  if (!lhsSymbol) {
    throw new Error(`LHS symbol in ${nameof(bindPropertyAccessExpression)} is null.`);
  }

  bindIdentifier(program, sourceFile, propertyAccessExpression.name, lhsSymbol);
  (<Mutable<ast.PropertyAccessExpression>> propertyAccessExpression).symbol = propertyAccessExpression.name.symbol;
}

function bindIdentifier(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: Symbol,
): void {
  if (identifier.symbol) {
    return;
  }

  // HACK: Ignore println for now.
  if (identifier.value == "println") {
    return;
  }

  if (!parentSymbol) {
    const scope = getSymbolScopeFromNode(identifier);
    const symbol = getSymbolByName(scope, identifier.value);
    (<Mutable<ast.Identifier>> identifier).symbol = symbol;
  } else {
    if (!parentSymbol.members) {
      throw new Error(`parentSymbol.members is null in ${nameof(bindIdentifier)}: ${identifier.value}`);
    }

    if (!parentSymbol.members[identifier.value]) {
      throw new Error(`Failed to get member symbol ${identifier.value} from ${parentSymbol.name}`);
    }

    (identifier as Mutable<ast.Identifier>).symbol = parentSymbol.members[identifier.value];
  }
}
