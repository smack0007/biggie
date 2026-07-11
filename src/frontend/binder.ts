import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bool, hasFlag, nameof } from "../shims.ts";
import { dump } from "../utils.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
  DuplicateSymbol,
  DuplicateSymbolMember,
}

export interface BindError extends ast.Diagnostic {
  kind: BindErrorKind;
  message: string;
  fileName: string;
  pos: ast.TextPosition;
}

function bindError(kind: BindErrorKind, message: string, node: ast.SyntaxNode): BindError {
  const sourceFile = ast.getSourceFileFromNode(node);

  // TODO: There should be some --debug flag that will pack this into the error.
  console.error((new Error()).stack);

  return {
    kind,
    message,
    fileName: sourceFile?.fileName ?? "<unknown>",
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

function setMember(node: ast.SyntaxNode, symbol: ast.Symbol, name: string, value: ast.Symbol): void {
  if (!symbol.members) {
    throw bindError(BindErrorKind.Unexpected, `Symbol named "${symbol.name}" does not have members.`, node);
  }
  if (symbol.members[name] !== undefined) {
    throw bindError(
      BindErrorKind.DuplicateSymbolMember,
      `Symbol "${symbol.name}" already has a member named "${name}".`,
      node,
    );
  }
  symbol.members[name] = value;
}

function bindInitialize(program: ast.Program): void {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    sourceFile.parent = program;
    sourceFile.nextSymbolScope = program;

    ast.walkChildren(
      sourceFile,
      (node: ast.SyntaxNode, parent: ast.SyntaxNode): bool => {
        node.parent = parent;

        if (ast.isScope(node)) {
          node.nextSymbolScope = getParentNode<ast.Scope>(node, ast.isScope);
        }

        node.bindState = ast.BindState.Initialized;

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
    // Cannot use bindError here as that will try and find the parent SourceFile. This error
    // indicates an error in the binder anyways.
    throw <BindError> {
      kind: BindErrorKind.Unexpected,
      message: `${ast.SyntaxKind[node.kind]} node has no parent.`,
    };
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

// TODO: Can we get away with fewer Required<>s?
function getScopeFromNode(node: ast.SyntaxNode): Required<ast.Scope> {
  return getParentNode<Required<ast.Scope>>(node, ast.isScope);
}

function getSymbolFromScopeByName(node: ast.SyntaxNode, name: string): ast.Symbol {
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
  for (const node of sourceFile.statements) {
    switch (node.kind) {
      case ast.SyntaxKind.ImportDeclaration:
        bindImportDeclaration(program, sourceFile, <ast.ImportDeclaration> node);
        break;

      case ast.SyntaxKind.EnumDeclaration:
        bindEnumDeclaration(program, sourceFile, <ast.EnumDeclaration> node);
        break;

      case ast.SyntaxKind.FuncDeclaration:
        bindFuncDeclaration(program, sourceFile, <ast.FuncDeclaration> node);
        break;

      case ast.SyntaxKind.MethodDeclaration:
        bindMethodDeclaration(program, sourceFile, <ast.MethodDeclaration> node);
        break;

      case ast.SyntaxKind.StructDeclaration:
        bindStructDeclaration(program, sourceFile, <ast.StructDeclaration> node);
        break;

      case ast.SyntaxKind.VarDeclaration:
        bindVarDeclaration(program, sourceFile, <ast.VarDeclaration> node);
        break;
    }
  }

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
      flags: ast.SymbolFlags.Module,
      declaration: importDeclaration,
      sourceFileName: sourceFile.fileName,
      name: importDeclaration.alias.value,
      members: exports,
    };
    importDeclaration.type = importDeclaration.symbol;

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
    flags: ast.SymbolFlags.Enum,
    declaration: enumDeclaration,
    sourceFileName: sourceFile.fileName,
    name: enumDeclaration.name.value,
    members,
  };
  enumDeclaration.type = enumDeclaration.symbol;

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
    flags: ast.SymbolFlags.EnumMember,
    sourceFileName: sourceFile.fileName,
    name: enumMember.name.value,
  };

  enumMember.bindState = ast.BindState.Finished;
}

function bindFuncDeclaration(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  funcDeclaration: ast.FuncDeclaration,
): void {
  for (const arg of funcDeclaration.args) {
    bindVarDeclaration(program, sourceFile, arg);
  }

  bindTypeNode(program, sourceFile, funcDeclaration.returnType);
  bindStatementBlock(program, sourceFile, funcDeclaration.body);

  funcDeclaration.symbol = {
    flags: ast.SymbolFlags.Func,
    declaration: funcDeclaration,
    sourceFileName: sourceFile.fileName,
    name: funcDeclaration.name.value,
  };
  funcDeclaration.type = funcDeclaration.symbol;

  setLocal(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  if (funcDeclaration.isExported) {
    setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  }

  funcDeclaration.bindState = ast.BindState.Finished;
}

function bindMethodDeclaration(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  methodDeclaration: ast.MethodDeclaration,
): void {
  bindMethodReceiver(program, sourceFile, methodDeclaration.receiver);

  for (const arg of methodDeclaration.args) {
    bindVarDeclaration(program, sourceFile, arg);
  }

  bindTypeNode(program, sourceFile, methodDeclaration.returnType);
  bindStatementBlock(program, sourceFile, methodDeclaration.body);

  methodDeclaration.symbol = {
    flags: ast.SymbolFlags.Method,
    declaration: methodDeclaration,
    sourceFileName: sourceFile.fileName,
    name: methodDeclaration.name.value,
  };
  methodDeclaration.type = methodDeclaration.symbol;

  const receiverType = ast.getSymbol(methodDeclaration.receiver.declaredType, ast.SymbolFlags.Struct);
  setMember(methodDeclaration, receiverType, methodDeclaration.symbol.name, methodDeclaration.symbol);

  // TODO: How do we export methods?
  // if (methodDeclaration.isExported) {
  //   setExport(methodDeclaration, sourceFile, methodDeclaration.symbol.name, methodDeclaration.symbol);
  // }

  methodDeclaration.bindState = ast.BindState.Finished;
}

function bindMethodReceiver(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  methodReceiver: ast.MethodReceiver,
): void {
  bindTypeReference(program, sourceFile, methodReceiver.declaredType);

  methodReceiver.symbol = {
    flags: ast.SymbolFlags.Var,
    declaration: methodReceiver,
    sourceFileName: sourceFile.fileName,
    name: methodReceiver.name.value,
    members: methodReceiver.declaredType.symbol?.members,
  };
  methodReceiver.type = methodReceiver.declaredType.type;

  const scope = getScopeFromNode(methodReceiver);
  setLocal(methodReceiver, scope, methodReceiver.symbol.name, methodReceiver.symbol);

  methodReceiver.bindState = ast.BindState.Finished;
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
    flags: ast.SymbolFlags.Type | ast.SymbolFlags.Struct,
    declaration: structDeclaration,
    sourceFileName: sourceFile.fileName,
    name: structDeclaration.name.value,
    members,
  };
  structDeclaration.type = structDeclaration.symbol;

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
    flags: ast.SymbolFlags.StructMember,
    sourceFileName: sourceFile.fileName,
    name: structMember.name.value,
  };

  structMember.bindState = ast.BindState.Finished;
}

function bindVarDeclaration(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  varDeclaration: ast.VarDeclaration,
): void {
  bindTypeNode(program, sourceFile, varDeclaration.declaredType);

  varDeclaration.type = varDeclaration.declaredType.symbol;
  varDeclaration.symbol = {
    flags: ast.SymbolFlags.Var,
    declaration: varDeclaration,
    sourceFileName: sourceFile.fileName,
    name: varDeclaration.name.value,
  };

  const scope = getScopeFromNode(varDeclaration);
  setLocal(varDeclaration, scope, varDeclaration.symbol.name, varDeclaration.symbol);

  varDeclaration.bindState = ast.BindState.Finished;
}

function bindStatementBlock(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  statementBlock: ast.StatementBlock,
): void {
  for (const statement of statementBlock.statements) {
    switch (statement.kind) {
      case ast.SyntaxKind.ExpressionStatement:
        bindExpressionStatement(program, sourceFile, <ast.ExpressionStatement> statement);
        break;

      case ast.SyntaxKind.VarDeclaration:
        bindVarDeclaration(program, sourceFile, <ast.VarDeclaration> statement);
        break;
    }
  }
}

function bindExpressionStatement(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  expressionStatement: ast.ExpressionStatement,
): void {
  bindExpression(program, sourceFile, expressionStatement.expression);
}

function bindExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  expression: ast.Expression,
): void {
  switch (expression.kind) {
    case ast.SyntaxKind.CallExpression:
      bindCallExpression(program, sourceFile, <ast.CallExpression> expression);
      break;

    case ast.SyntaxKind.PropertyAccessExpression:
      bindPropertyAccessExpression(program, sourceFile, <ast.PropertyAccessExpression> expression);
      break;

    case ast.SyntaxKind.Identifier:
      bindIdentifier(program, sourceFile, <ast.Identifier> expression);
      break;

    case ast.SyntaxKind.BoolLiteral:
      bindBoolLiteral(program, sourceFile, <ast.BoolLiteral> expression);
      break;

    case ast.SyntaxKind.IntLiteral:
      bindIntLiteral(program, sourceFile, <ast.IntLiteral> expression);
      break;

    case ast.SyntaxKind.StringLiteral:
      bindStringLiteral(program, sourceFile, <ast.StringLiteral> expression);
      break;
  }
}

function bindCallExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  callExpression: ast.CallExpression,
): void {
  bindExpression(program, sourceFile, callExpression.expression);
  for (const arg of callExpression.args) {
    bindExpression(program, sourceFile, arg);
  }

  callExpression.symbol = callExpression.expression.symbol;

  callExpression.bindState = ast.BindState.Finished;
}

function bindPropertyAccessExpression(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  bindExpression(program, sourceFile, propertyAccessExpression.expression);

  bindIdentifier(
    program,
    sourceFile,
    propertyAccessExpression.name,
    propertyAccessExpression.expression.type,
  );

  propertyAccessExpression.type = propertyAccessExpression.name.type;
  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;

  propertyAccessExpression.bindState = ast.BindState.Finished;
}

function bindIdentifier(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: ast.Symbol,
): void {
  if (!parentSymbol) {
    identifier.symbol = getSymbolFromScopeByName(identifier, identifier.value);
  } else {
    identifier.symbol = getSymbolMemberByIdentifier(parentSymbol, identifier);
  }

  identifier.type = identifier.symbol.declaration?.type;
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
  bindTypeNode(program, sourceFile, arrayType.elementType);

  arrayType.symbol = builtins.globals.Array;
  arrayType.type = builtins.globals.Array;
  arrayType.bindState = ast.BindState.Finished;
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
    typeReference.typeName.left.symbol = getSymbolFromScopeByName(typeReference, typeReference.typeName.left.value);
    typeReference.typeName.left.bindState = ast.BindState.Finished;

    typeReference.typeName.right.symbol = getSymbolMemberByIdentifier(
      typeReference.typeName.left.symbol,
      typeReference.typeName.right,
    );
    typeReference.typeName.right.bindState = ast.BindState.Finished;

    typeReference.typeName.symbol = typeReference.typeName.right.symbol;
  } else {
    typeReference.typeName.symbol = getSymbolFromScopeByName(typeReference, typeReference.typeName.value);
  }

  typeReference.typeName.type = typeReference.typeName.symbol;
  typeReference.typeName.bindState = ast.BindState.Finished;

  typeReference.symbol = typeReference.typeName.symbol;
  typeReference.type = typeReference.symbol;
  typeReference.bindState = ast.BindState.Finished;
}

function bindBoolLiteral(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  boolLiteral: ast.BoolLiteral,
): void {
  boolLiteral.type = builtins.globals.bool;
  boolLiteral.bindState = ast.BindState.Finished;
}

function bindIntLiteral(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  intLiteral: ast.IntLiteral,
): void {
  intLiteral.type = builtins.globals.int;
  intLiteral.bindState = ast.BindState.Finished;
}

function bindStringLiteral(
  program: ast.Program,
  sourceFile: Required<ast.SourceFile>,
  stringLiteral: ast.StringLiteral,
): void {
  stringLiteral.type = builtins.globals.string;
  stringLiteral.bindState = ast.BindState.Finished;
}
