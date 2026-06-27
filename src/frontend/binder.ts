import * as ast from "./ast/mod.ts";
import * as program from "./program.ts";
import { bool, nameof } from "../shims.ts";
import { BindState } from "./ast/syntaxTree.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
  DuplicateSymbol,
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
    // Import declarations lead to source files being finished before we get here.
    if (sourceFile.bindState != ast.BindState.Finished) {
      bindSourceFile(program, <Required<ast.SourceFile>> sourceFile);
    }
  }
}

function bindInitialize(program: program.Program): void {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    ast.walkChildren(
      sourceFile,
      (node: ast.SyntaxNode, parent: ast.SyntaxNode): bool => {
        node.parent = parent;

        if (ast.isBindNode(node)) {
          if (ast.isScope(node)) {
            node.nextSymbolScope = getParentNode<Required<ast.Scope>>(node, ast.isScope);
          }

          node.bindState = ast.BindState.Initialized;
        }

        return true;
      },
    );

    sourceFile.bindState = ast.BindState.Initialized;
  }
}

function getParentNode<T>(node: ast.SyntaxNode, typeGuard: (node: ast.SyntaxNode) => bool): T {
  if (node.parent == null) {
    throw bindError(BindErrorKind.Unexpected, `${ast.SyntaxKind[node.kind]} node has no parent.`, node);
  }

  node = node.parent;
  while (!typeGuard(node) && node.parent != null) {
    node = node.parent;
  }

  if (!typeGuard(node)) {
    throw bindError(
      BindErrorKind.Unexpected,
      `Failed to get parent node matching type guard "${typeGuard.name}".`,
      node,
    );
  }

  return <T> node;
}

function getSourceFileFromNode(node: ast.SyntaxNode): Required<ast.SourceFile> {
  return getParentNode<Required<ast.SourceFile>>(node, (node) => node.kind == ast.SyntaxKind.SourceFile);
}

function getScopeFromNode(node: ast.SyntaxNode): Required<ast.Scope> {
  return getParentNode<Required<ast.Scope>>(node, ast.isScope);
}

function getSymbolByName(node: ast.SyntaxNode, name: string): ast.Symbol {
  let scope = getScopeFromNode(node);

  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      return scope.locals[name];
    }
    scope = <Required<ast.Scope>> scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    return scope.locals[name];
  }

  throw bindError(BindErrorKind.MissingSymbol, `Failed to get symbol named "${name}".`, node);
}

function setLocal(node: ast.SyntaxNode, scope: ast.Scope, name: string, value: ast.Symbol): void {
  if (scope.locals[name] !== undefined) {
    throw bindError(BindErrorKind.DuplicateSymbol, `Symbol named "${name}" already exists in scope.`, node);
  }

  scope.locals[name] = value;
}

function setExport(node: ast.SyntaxNode, sourceFile: ast.SourceFile, name: string, value: ast.Symbol): void {
  if (sourceFile.exports[name] !== undefined) {
    throw bindError(
      BindErrorKind.DuplicateSymbol,
      `Symbol named "${name}" already exported in source file "${sourceFile.fileName}".`,
      node,
    );
  }

  sourceFile.exports[name] = value;
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

  sourceFile.bindState = ast.BindState.Finished;
}

function bindImportDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  importDeclaration: ast.ImportDeclaration,
): void {
  if (program.sourceFiles[importDeclaration.resolvedFileName].bindState != ast.BindState.Finished) {
    bindSourceFile(program, sourceFile);
  }

  const exports = program.sourceFiles[importDeclaration.resolvedFileName].exports;

  if (importDeclaration.alias?.value) {
    importDeclaration.symbol = {
      sourceFileName: sourceFile.fileName,
      name: importDeclaration.alias.value,
      flags: ast.BindFlags.Module,
      members: exports,
    };

    sourceFile.locals[importDeclaration.alias.value] = importDeclaration.symbol!;
  } else {
    for (const [name, symbol] of Object.entries(exports)) {
      setLocal(importDeclaration, sourceFile, name, symbol);
    }
  }

  importDeclaration.bindState = ast.BindState.Finished;
}

function bindEnumDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  enumDeclaration: ast.EnumDeclaration,
): void {
  const members: ast.SymbolTable = {};
  for (const enumMember of enumDeclaration.members) {
    bindEnumMember(program, sourceFile, enumMember);
    members[enumMember.symbol!.name] = enumMember.symbol!;
  }

  enumDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumDeclaration.name.value,
    flags: ast.BindFlags.Enum,
    members,
  };

  setLocal(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  if (enumDeclaration.isExported) {
    setExport(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  }

  enumDeclaration.bindState = ast.BindState.Finished;
}

function bindEnumMember(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  enumMember: ast.EnumMember,
): void {
  enumMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumMember.name.value,
    flags: ast.BindFlags.EnumMember,
  };

  enumMember.bindState = ast.BindState.Finished;
}

function bindFuncDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  funcDeclaration: ast.FuncDeclaration,
): void {
  funcDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: funcDeclaration.name.value,
    flags: ast.BindFlags.Func,
  };

  setLocal(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  if (funcDeclaration.isExported) {
    setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  }

  funcDeclaration.bindState = ast.BindState.Finished;
}

function bindStructDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  structDeclaration: ast.StructDeclaration,
): void {
  const members: ast.SymbolTable = {};
  for (const structMember of structDeclaration.members) {
    bindStructMember(program, sourceFile, structMember);
    members[structMember.symbol!.name] = structMember.symbol!;
  }

  structDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structDeclaration.name.value,
    flags: ast.BindFlags.Var,
    members,
  };

  setLocal(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  if (structDeclaration.isExported) {
    setExport(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  }

  structDeclaration.bindState = ast.BindState.Finished;
}

function bindStructMember(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  structMember: ast.StructMember,
): void {
  structMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structMember.name.value,
    flags: ast.BindFlags.StructMember,
  };

  structMember.bindState = ast.BindState.Finished;
}

function bindVarDeclaration(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  varDeclaration: ast.VarDeclaration,
): void {
  let members: ast.SymbolTable | undefined;

  if (varDeclaration.type.kind == ast.SyntaxKind.TypeReference) {
    const typeReference = <ast.TypeReference> varDeclaration.type;
    if (typeReference.typeName.kind == ast.SyntaxKind.QualifiedName) {
      const qualifiedName = <ast.QualifiedName> typeReference.typeName;

      const module = getSymbolByName(varDeclaration, qualifiedName.left.value);

      // TODO: Check members is set

      const moduleExport = module.members![qualifiedName.right.value];

      // TODO: Check members is set.

      members = moduleExport.members;
    } else {
      const identifier = <ast.Identifier> typeReference.typeName;

      // HACK: Ignore int32 for now.
      if (identifier.value != "int32") {
        const symbol = getSymbolByName(varDeclaration, identifier.value);
        members = symbol.members;
      }
    }
  }

  varDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: varDeclaration.name.value,
    flags: ast.BindFlags.Var,
    members,
  };

  const scope = getScopeFromNode(varDeclaration);
  setLocal(varDeclaration, scope, varDeclaration.symbol.name, varDeclaration.symbol);

  varDeclaration.bindState = ast.BindState.Finished;
}

function bindPropertyAccessExpression(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  let lhsSymbol: ast.Symbol | undefined;

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

  propertyAccessExpression.bindState = BindState.Finished;
}

function bindIdentifier(
  program: program.Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: ast.Symbol,
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

  identifier.bindState = ast.BindState.Finished;
}
