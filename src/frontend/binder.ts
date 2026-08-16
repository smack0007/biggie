import * as ast from "../ast/mod.ts";
import { bool, nameof } from "../shims.ts";
import { dump } from "../utils.ts";
import * as builtins from "./builtins.ts";
import * as checker from "./checker.ts";
import { generateId, IDType } from "./ids.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
  DuplicateSymbol,
  DuplicateSymbolMember,
  TypeMismatch,
}

export interface BindError extends ast.Diagnostic {
  kind: BindErrorKind;
  message: string;
  fileName: string;
  pos: ast.TextPosition;
}

function bindError(kind: BindErrorKind, message: string, node: ast.SyntaxNode): BindError {
  const sourceFile = ast.findSourceFileFromNode(node);

  // TODO: There should be some --debug flag that will pack this into the error.
  console.error((new Error()).stack);

  return {
    category: ast.DiagnosticCategory.Error,
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
      bindSourceFile(<ast.SourceFile> sourceFile);
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
          node.nextSymbolScope = ast.findScopeFromNode(node.parent);
        }

        node.bindState = ast.BindState.Initialized;

        return true;
      },
    );

    sourceFile.bindState = ast.BindState.Initialized;
  }

  for (const [name, symbol] of Object.entries(builtins.globals)) {
    setLocal(program, program, name, {
      ...symbol,
      declaration: program,
    });
  }
  program.bindState = ast.BindState.Initialized;
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

function getSymbolFromScopeByName(scope: ast.Scope, name: string): ast.Symbol {
  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      return scope.locals[name];
    }
    scope = scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    return scope.locals[name];
  }

  throw bindError(BindErrorKind.MissingSymbol, `Failed to get symbol named "${name}".`, scope);
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

  throw bindError(BindErrorKind.MissingSymbol, `Failed to get symbol named "${identifier.value}".`, identifier);
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

function bindSourceFile(sourceFile: ast.SourceFile): void {
  for (const node of sourceFile.statements) {
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
    importDeclaration.symbol = {
      id: generateId(IDType.symbol),
      flags: ast.SymbolFlags.Module,
      declaration: importDeclaration,
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

function bindExternFuncDeclaration(externFuncDeclaration: ast.ExternFuncDeclaration): void {
  for (const arg of externFuncDeclaration.args) {
    bindVarDeclaration(arg);
  }

  bindTypeNode(externFuncDeclaration.returnType);

  externFuncDeclaration.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Extern | ast.SymbolFlags.Func,
    declaration: externFuncDeclaration,
    name: externFuncDeclaration.name.value,
  };
  externFuncDeclaration.type = externFuncDeclaration.symbol;

  const sourceFile = getSourceFileOrError(externFuncDeclaration);
  setLocal(externFuncDeclaration, sourceFile, externFuncDeclaration.symbol.name, externFuncDeclaration.symbol);
  // if (funcDeclaration.isExported) {
  //   setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  // }

  externFuncDeclaration.bindState = ast.BindState.Finished;
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
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Enum,
    declaration: enumDeclaration,
    name: enumDeclaration.name.value,
    members,
  };
  enumDeclaration.type = enumDeclaration.symbol;

  const sourceFile = getSourceFileOrError(enumDeclaration);
  setLocal(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  if (enumDeclaration.isExported) {
    setExport(enumDeclaration, sourceFile, enumDeclaration.symbol.name, enumDeclaration.symbol);
  }

  enumDeclaration.bindState = ast.BindState.Finished;
}

function bindEnumMember(enumMember: ast.EnumMember): void {
  enumMember.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.EnumMember,
    name: enumMember.name.value,
  };

  enumMember.bindState = ast.BindState.Finished;
}

function bindFuncDeclaration(funcDeclaration: ast.FuncDeclaration): void {
  for (const arg of funcDeclaration.args) {
    bindVarDeclaration(arg);
  }

  bindTypeNode(funcDeclaration.returnType);
  bindStatementBlock(funcDeclaration.body);

  funcDeclaration.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Func,
    declaration: funcDeclaration,
    name: funcDeclaration.name.value,
  };
  funcDeclaration.type = funcDeclaration.symbol;

  const sourceFile = getSourceFileOrError(funcDeclaration);
  setLocal(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  if (funcDeclaration.isExported) {
    setExport(funcDeclaration, sourceFile, funcDeclaration.symbol.name, funcDeclaration.symbol);
  }

  funcDeclaration.bindState = ast.BindState.Finished;
}

function bindMethodDeclaration(methodDeclaration: ast.MethodDeclaration): void {
  bindMethodReceiver(methodDeclaration.receiver);

  for (const arg of methodDeclaration.args) {
    bindVarDeclaration(arg);
  }

  bindTypeNode(methodDeclaration.returnType);
  bindStatementBlock(methodDeclaration.body);

  methodDeclaration.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Method,
    declaration: methodDeclaration,
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

function bindMethodReceiver(methodReceiver: ast.MethodReceiver): void {
  bindTypeReference(methodReceiver.declaredType);

  methodReceiver.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Var,
    declaration: methodReceiver,
    name: methodReceiver.name.value,
    members: methodReceiver.declaredType.symbol?.members,
  };
  methodReceiver.type = methodReceiver.declaredType.type;

  const scope = getScopeOrError(methodReceiver);
  setLocal(methodReceiver, scope, methodReceiver.symbol.name, methodReceiver.symbol);

  methodReceiver.bindState = ast.BindState.Finished;
}

function bindStructDeclaration(structDeclaration: ast.StructDeclaration): void {
  const members: ast.SymbolTable = {};
  for (const structMember of structDeclaration.members) {
    bindStructMember(structMember);
    members[structMember.symbol!.name] = structMember.symbol!;
  }

  structDeclaration.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Type | ast.SymbolFlags.Struct,
    declaration: structDeclaration,
    name: structDeclaration.name.value,
    members,
  };
  structDeclaration.type = structDeclaration.symbol;

  const sourceFile = getSourceFileOrError(structDeclaration);
  setLocal(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  if (structDeclaration.isExported) {
    setExport(structDeclaration, sourceFile, structDeclaration.symbol.name, structDeclaration.symbol);
  }

  structDeclaration.bindState = ast.BindState.Finished;
}

function bindStructMember(structMember: ast.StructMember): void {
  structMember.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.StructMember,
    name: structMember.name.value,
  };

  structMember.bindState = ast.BindState.Finished;
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

  deferStatement.symbol = deferStatement.body.symbol;
  deferStatement.type = deferStatement.body.type;
  deferStatement.bindState = ast.BindState.Finished;
}

function bindExpressionStatement(expressionStatement: ast.ExpressionStatement): void {
  bindExpression(expressionStatement.expression);

  expressionStatement.symbol = expressionStatement.expression.symbol;
  expressionStatement.type = expressionStatement.expression.type;
  expressionStatement.bindState = ast.BindState.Finished;
}

function bindIfStatement(ifStatement: ast.IfStatement): void {
  bindExpression(ifStatement.condition);
  bindStatement(ifStatement.then);

  if (ifStatement.else) {
    bindStatement(ifStatement.else);
  }

  ifStatement.bindState = ast.BindState.Finished;
}

function bindReturnStatement(returnStatement: ast.ReturnStatement): void {
  bindExpression(returnStatement.expression);

  returnStatement.symbol = returnStatement.expression.symbol;
  returnStatement.type = returnStatement.expression.type;
  returnStatement.bindState = ast.BindState.Finished;
}

function bindStatementBlock(statementBlock: ast.StatementBlock): void {
  for (const statement of statementBlock.statements) {
    bindStatement(statement);
  }

  statementBlock.bindState = ast.BindState.Finished;
}

function bindWhileStatement(whileStatement: ast.WhileStatement): void {
  bindExpression(whileStatement.condition);
  bindStatement(whileStatement.body);

  whileStatement.bindState = ast.BindState.Finished;
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

  varDeclaration.type = varDeclaration.declaredType.type;
  varDeclaration.symbol = {
    id: generateId(IDType.symbol),
    flags: ast.SymbolFlags.Var,
    declaration: varDeclaration,
    name: varDeclaration.name.value,
  };

  const scope = getScopeOrError(varDeclaration);
  setLocal(varDeclaration, scope, varDeclaration.symbol.name, varDeclaration.symbol);

  varDeclaration.bindState = ast.BindState.Finished;
}

function bindExpression(expression: ast.Expression, typeContext?: ast.Symbol): void {
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
      bindIdentifier(<ast.Identifier> expression);
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
  bindExpression(additiveExpression.lhs);
  bindExpression(additiveExpression.rhs);

  additiveExpression.type = checker.operationResult(
    additiveExpression.operator,
    additiveExpression.lhs.type ?? null,
    additiveExpression.rhs.type ?? null,
  ) ?? undefined;
  additiveExpression.bindState = ast.BindState.Finished;
}

function bindArrayLiteral(arrayLiteral: ast.ArrayLiteral): void {
  for (const element of arrayLiteral.elements) {
    bindExpression(element);
  }

  const globals = getGlobalsOrError(arrayLiteral);
  arrayLiteral.type = getSymbolFromScopeByName(globals, builtins.GlobalName.Array);
  arrayLiteral.bindState = ast.BindState.Finished;
}

function bindCallExpression(callExpression: ast.CallExpression): void {
  bindExpression(callExpression.expression);
  for (const arg of callExpression.args) {
    bindExpression(arg);
  }

  callExpression.symbol = callExpression.expression.symbol;
  callExpression.type = callExpression.expression.type;
  callExpression.bindState = ast.BindState.Finished;
}

function bindComparisonExpression(comparisonExpression: ast.ComparisonExpression): void {
  bindExpression(comparisonExpression.lhs);
  bindExpression(comparisonExpression.rhs);

  comparisonExpression.type = builtins.globals[builtins.GlobalName.bool];
  comparisonExpression.bindState = ast.BindState.Finished;
}

function bindEqualityExpression(equalityExpression: ast.EqualityExpression): void {
  bindExpression(equalityExpression.lhs);
  bindExpression(equalityExpression.rhs);

  equalityExpression.type = builtins.globals[builtins.GlobalName.bool];
  equalityExpression.bindState = ast.BindState.Finished;
}

function bindParenthesizedExpression(parenthesizedExpression: ast.ParenthesizedExpression): void {
  bindExpression(parenthesizedExpression.expression);

  parenthesizedExpression.type = parenthesizedExpression.expression.type;
  parenthesizedExpression.symbol = parenthesizedExpression.expression.symbol;
  parenthesizedExpression.bindState = ast.BindState.Finished;
}

function bindPropertyAccessExpression(propertyAccessExpression: ast.PropertyAccessExpression): void {
  bindExpression(propertyAccessExpression.expression);

  bindIdentifier(propertyAccessExpression.name, propertyAccessExpression.expression.type);

  propertyAccessExpression.type = propertyAccessExpression.name.type;
  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;
  propertyAccessExpression.bindState = ast.BindState.Finished;
}

function bindIdentifier(identifier: ast.Identifier, parentSymbol?: ast.Symbol): void {
  if (!parentSymbol) {
    identifier.symbol = getSymbolFromScopeByIdentifier(identifier);
  } else {
    identifier.symbol = getSymbolMemberByIdentifier(parentSymbol, identifier);
  }

  identifier.type = identifier.symbol.declaration?.type;
  identifier.bindState = ast.BindState.Finished;
}

function bindTypeNode(typeNode: ast.TypeNode): void {
  if (ast.isArrayType(typeNode)) {
    bindArrayType(typeNode);
  } else if (ast.isPointerType(typeNode)) {
    bindPointerType(typeNode);
  } else {
    bindTypeReference(<ast.TypeReference> typeNode);
  }
  typeNode.bindState = ast.BindState.Finished;
}

function bindArrayType(arrayType: ast.ArrayType): void {
  bindTypeNode(arrayType.elementType);

  const globals = getGlobalsOrError(arrayType);
  arrayType.symbol = getSymbolFromScopeByName(globals, builtins.GlobalName.Array);
  arrayType.type = arrayType.symbol;
  arrayType.bindState = ast.BindState.Finished;
}

function bindPointerType(pointerType: ast.PointerType): void {
}

function bindTypeReference(typeReference: ast.TypeReference): void {
  if (ast.isQualifiedName(typeReference.typeName)) {
    bindQualifiedName(typeReference.typeName);
  } else {
    bindIdentifier(typeReference.typeName);
    typeReference.typeName.type = typeReference.typeName.symbol;
  }

  typeReference.symbol = typeReference.typeName.symbol;
  typeReference.type = typeReference.typeName.type;
  typeReference.bindState = ast.BindState.Finished;
}

function bindQualifiedName(qualifiedName: ast.QualifiedName): void {
  bindIdentifier(qualifiedName.left);
  qualifiedName.left.type = qualifiedName.left.symbol;
  bindIdentifier(qualifiedName.right, qualifiedName.left.symbol);
  qualifiedName.right.type = qualifiedName.right.symbol;

  qualifiedName.symbol = qualifiedName.right.symbol;
  qualifiedName.type = qualifiedName.right.type;
  qualifiedName.bindState = ast.BindState.Finished;
}

function bindBoolLiteral(boolLiteral: ast.BoolLiteral): void {
  const globals = getGlobalsOrError(boolLiteral);
  boolLiteral.type = getSymbolFromScopeByName(globals, builtins.GlobalName.bool);
  boolLiteral.bindState = ast.BindState.Finished;
}

function bindIntLiteral(intLiteral: ast.IntLiteral): void {
  const globals = getGlobalsOrError(intLiteral);
  intLiteral.type = getSymbolFromScopeByName(globals, builtins.GlobalName.int);
  intLiteral.bindState = ast.BindState.Finished;
}

function bindStringLiteral(stringLiteral: ast.StringLiteral): void {
  const globals = getGlobalsOrError(stringLiteral);
  stringLiteral.type = getSymbolFromScopeByName(globals, builtins.GlobalName.string);
  stringLiteral.bindState = ast.BindState.Finished;
}

function bindStructLiteral(structLiteral: ast.StructLiteral, typeContext?: ast.Symbol): void {
  // TODO: Extend the grammer so that StructLiteral can explicitly specify what type it is.
  if (!typeContext) {
    throw bindError(
      BindErrorKind.Unexpected,
      "typeContext must currently be set for structLiterals",
      structLiteral,
    );
  }

  structLiteral.type = typeContext;
  structLiteral.bindState = ast.BindState.Finished;
}
