import * as assert from "../assert.ts";
import * as ast from "../ast/mod.ts";
import { TypeSymbol } from "../ast/symbols.ts";
import { bool, nameof } from "../shims.ts";
import { dump } from "../utils.ts";
import * as builtins from "./builtins.ts";
import * as checker from "./checker.ts";

export enum BindErrorKind {
  Unexpected,
  DuplicateSymbol,
  DuplicateSymbolMember,
  InvalidMethodReceiver,
  MissingSymbol,
  NotCallable,
  TypeMismatch,
  UnexpectedSymbolKind,
}

export interface BindError extends ast.Diagnostic {
  kind: BindErrorKind;
}

function bindError(kind: BindErrorKind, message: string, node: ast.SyntaxNode): BindError {
  const sourceFile = ast.findSourceFileFromNode(node);

  // TODO: There should be some --debug flag that will pack this into the error.
  // console.error((new Error()).stack);

  return {
    category: ast.DiagnosticCategory.Error,
    kind,
    message: `[${BindErrorKind[kind]}]: ${message}`,
    fileName: sourceFile?.fileName ?? "<unknown>",
    pos: node.startPos,
  };
}

export function bind(program: ast.Program): void {
  bindInitialize(program);

  for (const sourceFile of Object.values(program.sourceFiles)) {
    // Import declarations lead to source files being finished before we get here.
    if (sourceFile.bindState != ast.BindState.Finished) {
      bindSourceFile(<ast.SourceFile> sourceFile);
    }
  }
}

function setLocal(node: ast.SyntaxNode, scope: ast.Scope, name: string, value: ast.Symbol): void {
  if (scope.locals[name] !== undefined) {
    throw bindError(BindErrorKind.DuplicateSymbol, `Symbol named "${name}" already exists in scope.`, node);
  }

  scope.locals[name] = value;
}

function setMember(
  node: ast.SyntaxNode,
  symbol: ast.SymbolWithMembers,
  name: string,
  value: ast.Symbol,
): void {
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
          node.nextSymbolScope = ast.findScopeFromNode(node.parent);
        }

        return true;
      },
    );

    sourceFile.bindState = ast.BindState.Initialized;
  }

  for (const [name, symbol] of Object.entries(builtins.globals)) {
    const programSymbol = { ...symbol };

    if (ast.isSymbolWithDeclaration(programSymbol)) {
      programSymbol.declaration = program;
    }

    setLocal(program, program, name, programSymbol);

    if (ast.isSymbolWithMembers(programSymbol)) {
      for (const [_, memberSymbol] of Object.entries(programSymbol.members)) {
        if (ast.isSymbolWithDeclaration(memberSymbol)) {
          memberSymbol.declaration = program;
        }
      }
    }
  }
}

function getProgramOrError(node: ast.SyntaxNode): ast.Program {
  const program = ast.findProgramFromNode(node);

  if (program == null) {
    throw bindError(
      BindErrorKind.Unexpected,
      `Failed to get ${ast.nameofSyntaxKind(ast.SyntaxKind.Program)} from "${ast.nameofSyntaxKind(node.kind)}"`,
      node,
    );
  }

  return program;
}

function getSourceFileOrError(node: ast.SyntaxNode): ast.SourceFile {
  const sourceFile = ast.findSourceFileFromNode(node);

  if (sourceFile == null) {
    throw bindError(
      BindErrorKind.Unexpected,
      `Failed to get ${ast.nameofSyntaxKind(ast.SyntaxKind.SourceFile)} from "${ast.nameofSyntaxKind(node.kind)}"`,
      node,
    );
  }

  return sourceFile;
}

function getGlobalsOrError(node: ast.SyntaxNode): ast.Scope {
  const globals = ast.findProgramFromNode(node);

  if (globals == null) {
    throw bindError(
      BindErrorKind.MissingSymbol,
      `Failed to get global scope from "${ast.nameofSyntaxKind(node.kind)}"`,
      node,
    );
  }

  return globals;
}

function getScopeOrError(node: ast.SyntaxNode): ast.Scope {
  const scope = ast.findScopeFromNode(node);

  if (scope == null) {
    throw bindError(BindErrorKind.MissingSymbol, `Failed to get scope from "${ast.nameofSyntaxKind(node.kind)}"`, node);
  }

  return scope;
}

function getSymbolFromScopeByName<T extends ast.Symbol>(
  scope: ast.Scope,
  name: string,
  kind: ast.SymbolKind,
): T {
  let symbol: ast.Symbol | null = null;

  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      symbol = scope.locals[name];
      break;
    }
    scope = scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    symbol = scope.locals[name];
  }

  if (!symbol) {
    throw bindError(
      BindErrorKind.MissingSymbol,
      `Failed to get symbol named "${name}" in ${nameof(getSymbolFromScopeByName)}.`,
      scope,
    );
  }

  if (symbol.kind != kind) {
    throw bindError(
      BindErrorKind.UnexpectedSymbolKind,
      `Expected symbol named "${name}" to be symbol kind "${ast.nameofSymbolKind(kind)}".`,
      scope,
    );
  }

  return <T> symbol;
}

function getSymbolFromScopeByIdentifier(identifier: ast.Identifier): ast.Symbol {
  let scope = getScopeOrError(identifier);

  while (scope.nextSymbolScope) {
    if (scope.locals[identifier.value]) {
      return scope.locals[identifier.value];
    }
    scope = scope.nextSymbolScope;
  }

  if (scope.locals[identifier.value]) {
    return scope.locals[identifier.value];
  }

  throw bindError(
    BindErrorKind.MissingSymbol,
    `Failed to get symbol named "${identifier.value}" in ${nameof(getSymbolFromScopeByIdentifier)}.`,
    identifier,
  );
}

function getSymbolMemberByIdentifier(symbol: ast.SymbolWithMembers, identifier: ast.Identifier): ast.Symbol {
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

function bindSourceFile(sourceFile: ast.SourceFile): void {
  for (const node of sourceFile.statements) {
    try {
      switch (node.kind) {
        case ast.SyntaxKind.ImportDeclaration:
          bindImportDeclaration(<ast.ImportDeclaration> node);
          break;

        case ast.SyntaxKind.ExternFuncDeclaration:
          bindExternFuncDeclaration(<ast.ExternFuncDeclaration> node);
          break;

        case ast.SyntaxKind.EnumDeclaration:
          bindEnumDeclaration(<ast.EnumDeclaration> node);
          break;

        case ast.SyntaxKind.FuncDeclaration:
          bindFuncDeclaration(<ast.FuncDeclaration> node);
          break;

        case ast.SyntaxKind.MethodDeclaration:
          bindMethodDeclaration(<ast.MethodDeclaration> node);
          break;

        case ast.SyntaxKind.StructDeclaration:
          bindStructDeclaration(<ast.StructDeclaration> node);
          break;

        case ast.SyntaxKind.VarDeclaration:
          bindVarDeclaration(<ast.VarDeclaration> node);
          break;

        default:
          throw bindError(
            BindErrorKind.Unexpected,
            `Unexpected top level node ${ast.nameofSyntaxKind(node.kind)} in ${nameof(bindSourceFile)}`,
            node,
          );
      }
    } catch (error) {
      assert.rethrow(error);
      const program = getProgramOrError(sourceFile);
      program.diagnostics.push(<BindError> error);
    }
  }

  sourceFile.bindState = ast.BindState.Finished;
}

function bindImportDeclaration(importDeclaration: ast.ImportDeclaration): void {
  const program = getProgramOrError(importDeclaration);
  const sourceFile = getSourceFileOrError(importDeclaration);

  if (program.sourceFiles[importDeclaration.resolvedFileName].bindState != ast.BindState.Finished) {
    bindSourceFile(program.sourceFiles[importDeclaration.resolvedFileName]);
  }

  const exports = program.sourceFiles[importDeclaration.resolvedFileName].exports;

  if (importDeclaration.alias?.value) {
    importDeclaration.symbol = <ast.ImportSymbol> {
      kind: ast.SymbolKind.Import,
      id: ast.generateId(ast.IDType.Symbol),
      flags: ast.SymbolFlags.None,
      declaration: importDeclaration,
      name: importDeclaration.alias.value,
      members: exports,
    };

    sourceFile.locals[importDeclaration.alias.value] = importDeclaration.symbol!;
  } else {
    for (const [name, symbol] of Object.entries(exports)) {
      setLocal(importDeclaration, sourceFile, name, symbol);
    }
  }
}

function bindExternFuncDeclaration(externFuncDeclaration: ast.ExternFuncDeclaration): void {
  const argSymbols: ast.Symbol[] = [];
  for (const arg of externFuncDeclaration.args) {
    bindVarDeclaration(arg);

    assert.notNull(arg.symbol, "Expected arg.symbol not to be null");
    argSymbols.push(arg.symbol);
  }

  bindTypeNode(externFuncDeclaration.returnType);

  const symbol: ast.ExternFuncSymbol = {
    kind: ast.SymbolKind.ExternFunc,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.Extern,
    declaration: externFuncDeclaration,
    name: externFuncDeclaration.name.value,
    beginVaradicArgsIndex: 0,
    args: argSymbols,
  };
  externFuncDeclaration.symbol = symbol;

  const sourceFile = getSourceFileOrError(externFuncDeclaration);
  setLocal(externFuncDeclaration, sourceFile, externFuncDeclaration.symbol.name, externFuncDeclaration.symbol);
  // if (funcDeclaration.isExported) {
  //   setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  // }
}

function bindEnumDeclaration(
  enumDeclaration: ast.EnumDeclaration,
): void {
  const members: ast.SymbolTable = {};
  for (const enumMember of enumDeclaration.members) {
    bindEnumMember(enumMember);
    members[enumMember.symbol!.name] = enumMember.symbol!;
  }

  enumDeclaration.symbol = {
    kind: ast.SymbolKind.Enum,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: enumDeclaration,
    name: enumDeclaration.name.value,
    members,
  };

  const sourceFile = getSourceFileOrError(enumDeclaration);
  setLocal(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  if (enumDeclaration.isExported) {
    setExport(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  }
}

function bindEnumMember(enumMember: ast.EnumMember): void {
  enumMember.symbol = {
    kind: ast.SymbolKind.EnumMember,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    name: enumMember.name.value,
    declaration: enumMember,
  };
}

function bindFuncDeclaration(funcDeclaration: ast.FuncDeclaration): void {
  const argSymbols: ast.Symbol[] = [];
  for (const arg of funcDeclaration.args) {
    bindVarDeclaration(arg);

    assert.notNull(arg.symbol, "Expected arg.symbol not to be null");
    argSymbols.push(arg.symbol);
  }

  bindTypeNode(funcDeclaration.returnType);
  bindStatementBlock(funcDeclaration.body);

  funcDeclaration.symbol = {
    kind: ast.SymbolKind.Func,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: funcDeclaration,
    name: funcDeclaration.name.value,
    beginVaradicArgsIndex: 0,
    args: argSymbols,
  };

  const sourceFile = getSourceFileOrError(funcDeclaration);
  setLocal(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  if (funcDeclaration.isExported) {
    setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  }
}

function bindMethodDeclaration(methodDeclaration: ast.MethodDeclaration): void {
  bindMethodReceiver(methodDeclaration.receiver);

  const argSymbols: ast.Symbol[] = [];
  for (const arg of methodDeclaration.args) {
    bindVarDeclaration(arg);

    assert.notNull(arg.symbol, "Expected arg.symbol not to be null");
    argSymbols.push(arg.symbol);
  }

  bindTypeNode(methodDeclaration.returnType);
  bindStatementBlock(methodDeclaration.body);

  methodDeclaration.symbol = {
    kind: ast.SymbolKind.Method,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: methodDeclaration,
    name: methodDeclaration.name.value,
    beginVaradicArgsIndex: 0,
    args: argSymbols,
  };

  const receiverType = methodDeclaration.receiver.declaredType.type;

  if (!receiverType || !ast.isStructSymbol(receiverType)) {
    throw bindError(
      BindErrorKind.InvalidMethodReceiver,
      `Method receiver must be a struct.`,
      methodDeclaration.receiver,
    );
  }

  setMember(methodDeclaration, receiverType, methodDeclaration.symbol.name, methodDeclaration.symbol);

  // TODO: How do we export methods?
  // if (methodDeclaration.isExported) {
  //   setExport(methodDeclaration, sourceFile, methodDeclaration.symbol.name, methodDeclaration.symbol);
  // }
}

function bindMethodReceiver(methodReceiver: ast.MethodReceiver): void {
  bindTypeReference(methodReceiver.declaredType);

  assert.notNull(methodReceiver.declaredType.type, "Expected methodReceiver.declaredType.type not to be null.");
  const symbol: ast.MethodReceiverSymbol = {
    kind: ast.SymbolKind.MethodReceiver,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: methodReceiver,
    name: methodReceiver.name.value,
    members: methodReceiver.declaredType.type.members,
  };

  methodReceiver.symbol = symbol;
  methodReceiver.type = methodReceiver.declaredType.type;

  const scope = getScopeOrError(methodReceiver);
  setLocal(methodReceiver, scope, methodReceiver.symbol.name, methodReceiver.symbol);
}

function bindStructDeclaration(structDeclaration: ast.StructDeclaration): void {
  const members: ast.SymbolTable = {};
  for (const structMember of structDeclaration.members) {
    bindStructMember(structMember);
    members[structMember.symbol!.name] = structMember.symbol!;
  }

  structDeclaration.symbol = <ast.StructSymbol> {
    kind: ast.SymbolKind.Struct,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: structDeclaration,
    name: structDeclaration.name.value,
    members,
  };

  const sourceFile = getSourceFileOrError(structDeclaration);
  setLocal(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  if (structDeclaration.isExported) {
    setExport(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  }
}

function bindStructMember(structMember: ast.StructMember): void {
  structMember.symbol = <ast.StructMemberSymbol> {
    kind: ast.SymbolKind.StructMember,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    name: structMember.name.value,
  };
}

function bindStatement(statement: ast.Statement): void {
  switch (statement.kind) {
    case ast.SyntaxKind.DeferStatement:
      bindDeferStatement(<ast.DeferStatement> statement);
      break;

    case ast.SyntaxKind.ExpressionStatement:
      bindExpressionStatement(<ast.ExpressionStatement> statement);
      break;

    case ast.SyntaxKind.IfStatement:
      bindIfStatement(<ast.IfStatement> statement);
      break;

    case ast.SyntaxKind.ReturnStatement:
      bindReturnStatement(<ast.ReturnStatement> statement);
      break;

    case ast.SyntaxKind.StatementBlock:
      bindStatementBlock(<ast.StatementBlock> statement);
      break;

    case ast.SyntaxKind.WhileStatement:
      bindWhileStatement(<ast.WhileStatement> statement);
      break;

    case ast.SyntaxKind.VarDeclaration:
      bindVarDeclaration(<ast.VarDeclaration> statement);
      break;

    default:
      throw bindError(
        BindErrorKind.Unexpected,
        `Unexpected statement node ${ast.nameofSyntaxKind(statement.kind)} in ${nameof(bindStatement)}`,
        statement,
      );
  }
}

function bindDeferStatement(deferStatement: ast.DeferStatement): void {
  bindStatement(deferStatement.body);
}

function bindExpressionStatement(expressionStatement: ast.ExpressionStatement): void {
  bindExpression(expressionStatement.expression, null);
}

function bindIfStatement(ifStatement: ast.IfStatement): void {
  bindExpression(ifStatement.condition, null);
  bindStatement(ifStatement.then);

  if (ifStatement.else) {
    bindStatement(ifStatement.else);
  }
}

function bindReturnStatement(returnStatement: ast.ReturnStatement): void {
  bindExpression(returnStatement.expression, null);
}

function bindStatementBlock(statementBlock: ast.StatementBlock): void {
  for (const statement of statementBlock.statements) {
    try {
      bindStatement(statement);
    } catch (error) {
      assert.rethrow(error);
      const program = getProgramOrError(statementBlock);
      program.diagnostics.push(<BindError> error);
    }
  }
}

function bindWhileStatement(whileStatement: ast.WhileStatement): void {
  bindExpression(whileStatement.condition, null);
  bindStatement(whileStatement.body);
}

function bindVarDeclaration(varDeclaration: ast.VarDeclaration): void {
  bindTypeNode(varDeclaration.declaredType);

  if (varDeclaration.initializer) {
    bindExpression(varDeclaration.initializer, varDeclaration.declaredType.type);

    if (
      varDeclaration.declaredType.type != varDeclaration.initializer.type &&
      !checker.isConvertible(varDeclaration.initializer.type ?? null, varDeclaration.declaredType.type ?? null)
    ) {
      throw bindError(
        BindErrorKind.TypeMismatch,
        `Type mistmatch ${varDeclaration.declaredType.type?.name} does not equal ${varDeclaration.initializer.type?.name} and conversion not possible.`,
        varDeclaration,
      );
    }
  }

  varDeclaration.symbol = <ast.VarSymbol> {
    kind: ast.SymbolKind.Var,
    id: ast.generateId(ast.IDType.Symbol),
    flags: ast.SymbolFlags.None,
    declaration: varDeclaration,
    name: varDeclaration.name.value,
  };
  varDeclaration.type = varDeclaration.declaredType.type;

  const scope = getScopeOrError(varDeclaration);
  setLocal(varDeclaration, scope, varDeclaration.symbol.name, varDeclaration.symbol);
}

function bindExpression(expression: ast.Expression, typeContext: ast.TypeSymbol | null): void {
  switch (expression.kind) {
    case ast.SyntaxKind.AdditiveExpression:
      bindAdditiveExpression(<ast.AdditiveExpression> expression);
      break;

    case ast.SyntaxKind.ArrayLiteral:
      bindArrayLiteral(<ast.ArrayLiteral> expression);
      break;

    case ast.SyntaxKind.BoolLiteral:
      bindBoolLiteral(<ast.BoolLiteral> expression);
      break;

    case ast.SyntaxKind.CallExpression:
      bindCallExpression(<ast.CallExpression> expression);
      break;

    case ast.SyntaxKind.ComparisonExpression:
      bindComparisonExpression(<ast.ComparisonExpression> expression);
      break;

    case ast.SyntaxKind.EqualityExpression:
      bindEqualityExpression(<ast.EqualityExpression> expression);
      break;

    case ast.SyntaxKind.Identifier:
      bindIdentifier(<ast.Identifier> expression, null);
      break;

    case ast.SyntaxKind.IntLiteral:
      bindIntLiteral(<ast.IntLiteral> expression);
      break;

    case ast.SyntaxKind.ParenthesizedExpression:
      bindParenthesizedExpression(<ast.ParenthesizedExpression> expression);
      break;

    case ast.SyntaxKind.PropertyAccessExpression:
      bindPropertyAccessExpression(<ast.PropertyAccessExpression> expression);
      break;

    case ast.SyntaxKind.StringLiteral:
      bindStringLiteral(<ast.StringLiteral> expression);
      break;

    case ast.SyntaxKind.StructLiteral:
      bindStructLiteral(<ast.StructLiteral> expression, typeContext);
      break;
  }
}

function bindAdditiveExpression(additiveExpression: ast.AdditiveExpression): void {
  bindExpression(additiveExpression.lhs, null);
  bindExpression(additiveExpression.rhs, null);

  additiveExpression.type = checker.operationResult(
    additiveExpression.operator,
    additiveExpression.lhs.type ?? null,
    additiveExpression.rhs.type ?? null,
  );
}

function bindArrayLiteral(arrayLiteral: ast.ArrayLiteral): void {
  for (const element of arrayLiteral.elements) {
    bindExpression(element, null);
  }

  const globals = getGlobalsOrError(arrayLiteral);
  arrayLiteral.type = getSymbolFromScopeByName<ast.TypeSymbol>(globals, builtins.GlobalName.Array, ast.SymbolKind.Type);
}

function bindCallExpression(callExpression: ast.CallExpression): void {
  bindExpression(callExpression.expression, null);

  assert.notNull(callExpression.expression.symbol, "Expected callExpress.expression.symbol not to be null");

  if (!ast.isCallableSymbol(callExpression.expression.symbol)) {
    throw bindError(
      BindErrorKind.NotCallable,
      `Symbol "${callExpression.expression.symbol.name}" is not callable.`,
      callExpression,
    );
  }

  for (const arg of callExpression.args) {
    bindExpression(arg, null);
  }

  // TODO: Validate arguments are of correct type.
  callExpression.symbol = callExpression.expression.symbol;
  callExpression.type = callExpression.expression.type;
}

function bindComparisonExpression(comparisonExpression: ast.ComparisonExpression): void {
  bindExpression(comparisonExpression.lhs, null);
  bindExpression(comparisonExpression.rhs, null);

  comparisonExpression.type = <ast.TypeSymbol> builtins.globals[builtins.GlobalName.bool];
}

function bindEqualityExpression(equalityExpression: ast.EqualityExpression): void {
  bindExpression(equalityExpression.lhs, null);
  bindExpression(equalityExpression.rhs, null);

  equalityExpression.type = <ast.TypeSymbol> builtins.globals[builtins.GlobalName.bool];
}

function bindParenthesizedExpression(parenthesizedExpression: ast.ParenthesizedExpression): void {
  bindExpression(parenthesizedExpression.expression, null);

  parenthesizedExpression.type = parenthesizedExpression.expression.type;
}

function bindPropertyAccessExpression(propertyAccessExpression: ast.PropertyAccessExpression): void {
  bindExpression(propertyAccessExpression.expression, null);
  bindIdentifier(
    propertyAccessExpression.name,
    ast.isSymbolWithMembers(propertyAccessExpression.expression.symbol)
      ? propertyAccessExpression.expression.symbol
      : propertyAccessExpression.expression.type,
  );

  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;
  propertyAccessExpression.type = propertyAccessExpression.name.type;
}

function bindIdentifier(identifier: ast.Identifier, parentSymbol: ast.Symbol | null): void {
  if (!parentSymbol) {
    identifier.symbol = getSymbolFromScopeByIdentifier(identifier);
  } else {
    if (ast.isSymbolWithMembers(parentSymbol)) {
      identifier.symbol = getSymbolMemberByIdentifier(parentSymbol, identifier);
    } else {
      throw bindError(BindErrorKind.Unexpected, "parentSymbol has no members.", identifier);
    }
  }

  try {
    if (
      ast.isSymbolWithDeclaration(identifier.symbol) &&
      // TODO: Make isSyntaxNodeWithType type guard.
      (identifier.symbol.declaration as unknown as { type: TypeSymbol | null }).type
    ) {
      identifier.type = (identifier.symbol.declaration as unknown as { type: TypeSymbol | null }).type;
    }
  } catch {
    console.info(identifier.symbol);
  }
}

function bindTypeNode(typeNode: ast.TypeNode): void {
  if (ast.isArrayType(typeNode)) {
    bindArrayType(typeNode);
  } else if (ast.isPointerType(typeNode)) {
    bindPointerType(typeNode);
  } else {
    bindTypeReference(<ast.TypeReference> typeNode);
  }
}

function bindArrayType(arrayType: ast.ArrayType): void {
  bindTypeNode(arrayType.elementType);

  const globals = getGlobalsOrError(arrayType);
  arrayType.type = getSymbolFromScopeByName<ast.TypeSymbol>(globals, builtins.GlobalName.Array, ast.SymbolKind.Type);
}

function bindPointerType(pointerType: ast.PointerType): void {
}

function bindTypeReference(typeReference: ast.TypeReference): void {
  if (ast.isQualifiedName(typeReference.typeName)) {
    bindQualifiedName(typeReference.typeName);
  } else {
    bindIdentifier(typeReference.typeName, null);
  }

  // TODO: We should check this cast.
  typeReference.type = <ast.TypeSymbol> typeReference.typeName.symbol;
}

function bindQualifiedName(qualifiedName: ast.QualifiedName): void {
  bindIdentifier(qualifiedName.left, null);
  bindIdentifier(qualifiedName.right, qualifiedName.left.symbol);

  qualifiedName.symbol = qualifiedName.right.symbol;
}

function bindBoolLiteral(boolLiteral: ast.BoolLiteral): void {
  const globals = getGlobalsOrError(boolLiteral);
  boolLiteral.type = getSymbolFromScopeByName<ast.TypeSymbol>(globals, builtins.GlobalName.bool, ast.SymbolKind.Type);
}

function bindIntLiteral(intLiteral: ast.IntLiteral): void {
  const globals = getGlobalsOrError(intLiteral);
  intLiteral.type = getSymbolFromScopeByName<ast.TypeSymbol>(globals, builtins.GlobalName.int, ast.SymbolKind.Type);
}

function bindStringLiteral(stringLiteral: ast.StringLiteral): void {
  const globals = getGlobalsOrError(stringLiteral);
  stringLiteral.type = getSymbolFromScopeByName<ast.TypeSymbol>(
    globals,
    builtins.GlobalName.string,
    ast.SymbolKind.Type,
  );
}

function bindStructLiteral(structLiteral: ast.StructLiteral, typeContext: ast.TypeSymbol | null): void {
  // TODO: Extend the grammer so that StructLiteral can explicitly specify what type it is.
  if (!typeContext) {
    throw bindError(
      BindErrorKind.Unexpected,
      "typeContext must currently be set for structLiterals",
      structLiteral,
    );
  }

  structLiteral.type = typeContext;
}
