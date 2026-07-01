import * as ast from "./ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bool, nameof } from "../shims.ts";
import { BindState } from "./ast/syntaxTree.ts";
import { dump } from "../utils.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
  DuplicateSymbol,
}

export interface BindError extends ast.Diagnostic {
  kind: BindErrorKind;
  message: string;
  fileName: string;
  pos: ast.TextPosition;
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

export function bind(program: ast.Program): void {
  bindInitialize(program);

  for (const sourceFile of Object.values(program.sourceFiles)) {
    // Import declarations lead to source files being finished before we get here.
    if (sourceFile.bindState != ast.BindState.Finished) {
      bindSourceFile(program, <Required<ast.SourceFile>> sourceFile);
    }
  }

  program.bindState = ast.BindState.Finished;
}

function setLocal(node: ast.SyntaxNode, scope: ast.Scope, name: string, value: ast.Symbol): void {
  if (scope.locals[name] !== undefined) {
    throw bindError(BindErrorKind.DuplicateSymbol, `Symbol named "${name}" already exists in scope.`, node);
  }

  scope.locals[name] = value;
}

function bindInitialize(program: ast.Program): void {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    sourceFile.parent = program;
    sourceFile.nextSymbolScope = program;

    ast.walkChildren(
      sourceFile,
      (node: ast.SyntaxNode, parent: ast.SyntaxNode): bool => {
        node.parent = parent;

        if (ast.isBindNode(node)) {
          if (ast.isScope(node)) {
            node.nextSymbolScope = getParentNode<ast.Scope>(node, ast.isScope);
          }

          node.bindState = ast.BindState.Initialized;
        }

        return true;
      },
    );

    sourceFile.bindState = ast.BindState.Initialized;
  }

  for (const [name, value] of Object.entries(builtins.globals)) {
    setLocal(program, program, name, value);
  }
  program.bindState = ast.BindState.Initialized;
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

// TODO: Can we get away with fewer Required<>s?
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

function getSymbolMemberByIdentifier(symbol: ast.Symbol, identifier: ast.Identifier): ast.Symbol {
  if (!symbol.members) {
    throw bindError(
      BindErrorKind.Unexpected,
      `members is null in symbol "${symbol.name}"`,
      identifier,
    );
  }

  if (!symbol.members[identifier.value]) {
    throw bindError(
      BindErrorKind.MissingSymbol,
      `Failed to get member symbol "${identifier.value}" from "${symbol.name}"`,
      identifier,
    );
  }

  return symbol.members[identifier.value];
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

function bindSourceFile(program: ast.Program, sourceFile: Required<ast.SourceFile>): void {
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
    }

    if (ast.isExpression(node)) {
      return bindExpression(program, sourceFile, node);
    }

    if (ast.isTypeNode(node)) {
      bindTypeNode(program, sourceFile, node);
      return false;
    }

    return true;
  });

  sourceFile.bindState = ast.BindState.Finished;
}

function bindImportDeclaration(
  program: ast.Program,
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
  program: ast.Program,
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
  program: ast.Program,
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
  program: ast.Program,
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
  program: ast.Program,
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
  program: ast.Program,
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
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  varDeclaration: ast.VarDeclaration,
): void {
  let members: ast.SymbolTable | undefined;

  if (ast.isArrayType(varDeclaration.type)) {
    members = builtins.globals["Array"].members;
  } else if (varDeclaration.type.kind == ast.SyntaxKind.TypeReference) {
    const typeReference = <ast.TypeReference> varDeclaration.type;

    if (typeReference.typeName.kind == ast.SyntaxKind.QualifiedName) {
      const qualifiedName = <ast.QualifiedName> typeReference.typeName;

      const module = getSymbolByName(varDeclaration, qualifiedName.left.value);

      if (!module.members) {
        throw bindError(
          BindErrorKind.Unexpected,
          `module.members is null in ${nameof(bindVarDeclaration)}: ${varDeclaration.name.value}`,
          varDeclaration,
        );
      }

      const moduleExport = module.members[qualifiedName.right.value];

      if (!moduleExport.members) {
        throw bindError(
          BindErrorKind.Unexpected,
          `moduleExport.members is null in ${nameof(bindVarDeclaration)}: ${varDeclaration.name.value}`,
          varDeclaration,
        );
      }

      members = moduleExport.members;
    } else {
      const identifier = <ast.Identifier> typeReference.typeName;

      const symbol = getSymbolByName(varDeclaration, identifier.value);
      members = symbol.members;
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

function bindExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  expression: ast.Expression,
): bool {
  switch (expression.kind) {
    case ast.SyntaxKind.CallExpression:
      bindCallExpression(program, sourceFile, <ast.CallExpression> expression);
      return false;

    case ast.SyntaxKind.PropertyAccessExpression:
      bindPropertyAccessExpression(program, sourceFile, <ast.PropertyAccessExpression> expression);
      return false;

    case ast.SyntaxKind.Identifier:
      bindIdentifier(program, sourceFile, <ast.Identifier> expression);
      return false;
  }

  return true;
}

function bindCallExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  callExpression: ast.CallExpression,
): void {
  bindExpression(program, sourceFile, callExpression.expression);
  for (const arg of callExpression.arguments) {
    bindExpression(program, sourceFile, arg);
  }

  callExpression.symbol = callExpression.expression.symbol;

  callExpression.bindState = BindState.Finished;
}

function bindPropertyAccessExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  bindExpression(program, sourceFile, propertyAccessExpression.expression);
  bindIdentifier(program, sourceFile, propertyAccessExpression.name, propertyAccessExpression.expression.symbol);

  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;

  propertyAccessExpression.bindState = BindState.Finished;
}

function bindIdentifier(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: ast.Symbol,
): void {
  if (identifier.symbol) {
    return;
  }

  if (!parentSymbol) {
    identifier.symbol = getSymbolByName(identifier, identifier.value);
  } else {
    identifier.symbol = getSymbolMemberByIdentifier(parentSymbol, identifier);
  }

  identifier.bindState = ast.BindState.Finished;
}

function bindTypeNode(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  typeNode: ast.TypeNode,
): void {
  if (ast.isArrayType(typeNode)) {
    bindArrayType(program, sourceFile, typeNode);
  } else if (ast.isPointerType(typeNode)) {
    bindPointerType(program, sourceFile, typeNode);
  } else {
    bindTypeReference(program, sourceFile, <ast.TypeReference> typeNode);
  }
}

function bindArrayType(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  arrayType: ast.ArrayType,
): void {
}

function bindPointerType(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  pointerType: ast.PointerType,
): void {
}

function bindTypeReference(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  typeReference: ast.TypeReference,
): void {
  if (ast.isQualifiedName(typeReference.typeName)) {
    typeReference.typeName.left.symbol = getSymbolByName(typeReference, typeReference.typeName.left.value);
    typeReference.typeName.left.bindState = ast.BindState.Finished;

    typeReference.typeName.right.symbol = getSymbolMemberByIdentifier(
      typeReference.typeName.left.symbol,
      typeReference.typeName.right,
    );
    typeReference.typeName.right.bindState = ast.BindState.Finished;

    typeReference.typeName.symbol = typeReference.typeName.right.symbol;
  } else {
    typeReference.typeName.symbol = getSymbolByName(typeReference, typeReference.typeName.value);
  }

  typeReference.typeName.bindState = ast.BindState.Finished;

  typeReference.symbol = typeReference.typeName.symbol;
  typeReference.bindState = ast.BindState.Finished;
}
