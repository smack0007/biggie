import * as ast from "./ast/mod.ts";
import * as program from "./program.ts";
import * as symbols from "./symbols.ts";
import { bool, nameof } from "../shims.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
}

export interface BindError extends program.Diagnostic {
  kind: BindErrorKind;
  message: string;
  fileName: string;
  pos: program.TextPosition;
}

function bindError(kind: BindErrorKind, message: string, node: ast.SyntaxNode): BindError {
  const sourceFile = getSourceFileFromNode(node);

  return {
    kind,
    message,
    fileName: sourceFile.fileName,
    pos: node.startPos,
  };
}

export function bind(program: program.Program): void {
  bindInitialize(program);

  for (const sourceFile of Object.values(program.sourceFiles)) {
    bindSourceFile(program, <Required<ast.SourceFile>> sourceFile);
  }
}

const SYMBOL_SCOPE_SYNTAX_KIND = [
  ast.SyntaxKind.SourceFile,
  ast.SyntaxKind.FuncDeclaration,
  ast.SyntaxKind.StatementBlock,
];

function bindInitialize(program: program.Program): void {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    sourceFile.locals = {};
    sourceFile.exports = {};

    ast.walkChildren(
      sourceFile,
      (node: ast.SyntaxNode, parent: ast.SyntaxNode): bool => {
        node.parent = parent;

        if (SYMBOL_SCOPE_SYNTAX_KIND.includes(node.kind)) {
          const scope = <symbols.Scope> node;
          scope.locals = {};

          scope.nextSymbolScope = getParentNodeByKinds<Required<symbols.Scope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);
        }

        return true;
      },
    );
  }
}

function getParentNodeByKinds<T>(node: ast.SyntaxNode, kinds: ast.SyntaxKind[]): T {
  if (node.parent == null) {
    throw bindError(BindErrorKind.Unexpected, `${ast.SyntaxKind[node.kind]} node has no parent.`, node);
  }

  node = node.parent;
  while (!kinds.includes(node.kind) && node.parent != null) {
    node = node.parent;
  }

  if (!kinds.includes(node.kind)) {
    throw bindError(
      BindErrorKind.Unexpected,
      `Failed to get parent node of ${kinds.map((x) => ast.SyntaxKind[x]).join(", ")}.`,
      node,
    );
  }

  return <T> node;
}

function getSourceFileFromNode(node: ast.SyntaxNode): Required<ast.SourceFile> {
  return getParentNodeByKinds<Required<ast.SourceFile>>(node, [ast.SyntaxKind.SourceFile]);
}

function getSymbolScopeFromNode(node: ast.SyntaxNode): Required<symbols.Scope> {
  return getParentNodeByKinds<Required<symbols.Scope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);
}

function getSymbolByName(node: ast.SyntaxNode, name: string): symbols.Symbol {
  let scope = getSymbolScopeFromNode(node);

  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      return scope.locals[name];
    }
    scope = <Required<symbols.Scope>> scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    return scope.locals[name];
  }

  throw bindError(BindErrorKind.MissingSymbol, `Failed to get symbol named "${name}".`, node);
}

function bindSourceFile(program: program.Program, sourceFile: Required<ast.SourceFile>): void {
  ast.walk(sourceFile, (node: ast.SyntaxNode): bool => {
    // TODO: All the cases in the switch should return false that binding only occurs once.
    switch (node.kind) {
      case ast.SyntaxKind.ImportDeclaration:
        bindImportDeclaration(program, sourceFile, <ast.ImportDeclaration> node);
        return false;

      case ast.SyntaxKind.EnumDeclaration:
        bindEnumDeclaration(program, sourceFile, <ast.EnumDeclaration> node);
        return false;

      case ast.SyntaxKind.FuncDeclaration:
        bindFuncDeclaration(program, sourceFile, <ast.FuncDeclaration> node);
        return true;

      case ast.SyntaxKind.StructDeclaration:
        bindStructDeclaration(program, sourceFile, <ast.StructDeclaration> node);
        return false;

      case ast.SyntaxKind.VarDeclaration:
        bindVarDeclaration(program, sourceFile, <ast.VarDeclaration> node);
        return false;

      case ast.SyntaxKind.PropertyAccessExpression:
        bindPropertyAccessExpression(program, sourceFile, <ast.PropertyAccessExpression> node);
        return true;

      // Just ignoring types for now.
      case ast.SyntaxKind.TypeReference:
        return false;
    }

    return true;
  });
}

function bindImportDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  importStatement: ast.ImportDeclaration,
): void {
  const moduleAlias = ast.getOrCalculateModuleAlias(importStatement);
  const members = program.sourceFiles[importStatement.resolvedFileName].exports;

  importStatement.symbol = {
    sourceFileName: sourceFile.fileName,
    name: moduleAlias,
    flags: symbols.Flags.Module,
    members,
  };

  sourceFile.locals[moduleAlias] = importStatement.symbol!;
}

function bindEnumDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  enumDeclaration: ast.EnumDeclaration,
): void {
  const members: symbols.Table = {};
  for (const enumMember of enumDeclaration.members) {
    bindEnumMember(program, sourceFile, enumMember);
    members[enumMember.symbol!.name] = enumMember.symbol!;
  }

  enumDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumDeclaration.name.value,
    flags: symbols.Flags.Enum,
    members,
  };

  sourceFile.locals[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  if (enumDeclaration.isExported) {
    sourceFile.exports[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  }
}

function bindEnumMember(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  enumMember: ast.EnumMember,
): void {
  enumMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumMember.name.value,
    flags: symbols.Flags.EnumMember,
  };
}

function bindFuncDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  functionDeclaration: ast.FuncDeclaration,
): void {
  functionDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: functionDeclaration.name.value,
    flags: symbols.Flags.Func,
  };

  sourceFile.locals[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  if (functionDeclaration.isExported) {
    sourceFile.exports[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  }
}

function bindStructDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  structDeclaration: ast.StructDeclaration,
): void {
  const members: symbols.Table = {};
  for (const structMember of structDeclaration.members) {
    bindStructMember(program, sourceFile, structMember);
    members[structMember.symbol!.name] = structMember.symbol!;
  }

  structDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structDeclaration.name.value,
    flags: symbols.Flags.Var,
    members,
  };

  sourceFile.locals[structDeclaration.symbol!.name] = structDeclaration.symbol!;
  if (structDeclaration.isExported) {
    sourceFile.exports[structDeclaration.name.value] = structDeclaration.symbol!;
  }
}

function bindStructMember(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  structMember: ast.StructMember,
): void {
  structMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structMember.name.value,
    flags: symbols.Flags.StructMember,
  };
}

function bindVarDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  variableDeclaration: ast.VarDeclaration,
): void {
  let members: symbols.Table | undefined;

  if (variableDeclaration.type.kind == ast.SyntaxKind.TypeReference) {
    const typeReference = <ast.TypeReference> variableDeclaration.type;
    if (typeReference.typeName.kind == ast.SyntaxKind.QualifiedName) {
      const qualifiedName = <ast.QualifiedName> typeReference.typeName;

      const module = getSymbolByName(variableDeclaration, qualifiedName.left.value);

      // TODO: Check members is set

      const moduleExport = module.members![qualifiedName.right.value];

      // TODO: Check members is set.

      members = moduleExport.members;
    } else {
      const identifier = <ast.Identifier> typeReference.typeName;

      // HACK: Ignore int32 for now.
      if (identifier.value != "int32") {
        const symbol = getSymbolByName(variableDeclaration, identifier.value);
        members = symbol.members;
      }
    }
  }

  variableDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: variableDeclaration.name.value,
    flags: symbols.Flags.Var,
    members,
  };

  const scope = getSymbolScopeFromNode(variableDeclaration);
  scope.locals[variableDeclaration.symbol!.name] = variableDeclaration.symbol!;
}

function bindPropertyAccessExpression(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  let lhsSymbol: symbols.Symbol | undefined;

  if (propertyAccessExpression.expression.kind == ast.SyntaxKind.Identifier) {
    const leftIdentifier = <ast.Identifier> propertyAccessExpression.expression;
    bindIdentifier(program, sourceFile, leftIdentifier);
    lhsSymbol = leftIdentifier.symbol;
  } else if (propertyAccessExpression.expression.kind == ast.SyntaxKind.PropertyAccessExpression) {
    const leftPropertyAccessExpression = <ast.PropertyAccessExpression> propertyAccessExpression.expression;
    bindPropertyAccessExpression(program, sourceFile, leftPropertyAccessExpression);
    lhsSymbol = leftPropertyAccessExpression.symbol;
  } else {
    throw bindError(
      BindErrorKind.Unexpected,
      `Unexpected lhs expression in ${nameof(bindPropertyAccessExpression)}: ${
        ast.SyntaxKind[propertyAccessExpression.expression.kind]
      }`,
      propertyAccessExpression,
    );
  }

  if (!lhsSymbol) {
    throw bindError(
      BindErrorKind.Unexpected,
      `LHS symbol in ${nameof(bindPropertyAccessExpression)} is null.`,
      propertyAccessExpression,
    );
  }

  bindIdentifier(program, sourceFile, propertyAccessExpression.name, lhsSymbol);
  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;
}

function bindIdentifier(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: symbols.Symbol,
): void {
  if (identifier.symbol) {
    return;
  }

  // HACK: Ignore println for now.
  if (identifier.value == "println") {
    return;
  }

  if (!parentSymbol) {
    identifier.symbol = getSymbolByName(identifier, identifier.value);
  } else {
    if (!parentSymbol.members) {
      throw bindError(
        BindErrorKind.Unexpected,
        `parentSymbol.members is null in ${nameof(bindIdentifier)}: ${identifier.value}`,
        identifier,
      );
    }

    if (!parentSymbol.members[identifier.value]) {
      throw bindError(
        BindErrorKind.MissingSymbol,
        `Failed to get member symbol ${identifier.value} from ${parentSymbol.name}`,
        identifier,
      );
    }

    identifier.symbol = parentSymbol.members[identifier.value];
  }
}
