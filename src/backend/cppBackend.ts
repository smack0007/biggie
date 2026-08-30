import * as assert from "../assert.ts";
import * as ast from "../ast/mod.ts";
import { hasFlag, int, nameof } from "../shims.ts";
import { makeOutputWriter, OutputWriter } from "../outputWriter.ts";
import { dump } from "../utils.ts";
import { backendError, BackendErrorKind } from "./shared.ts";

interface EmitContext {
  // TODO: We probably just need to have a reference to
  // the program at this point.
  entryFileName: string;

  output: OutputWriter;
  outputStack: OutputWriter[];

  // [SourceFile.fileName] = SourceFile
  sourceFiles: Record<string, ast.SourceFile>;
  // Set<fileName>
  emittedSourceFiles: Set<string>;
  // [SourceFile.fileName] = fileNamePrefix
  sourceFilePrefixes: Record<string, string>;
  // A stack of prefixes to attach to names.
  namePrefixStack: string[];
  // [moduleAlias] = SourceFile
  importMap: Record<string, ast.SourceFile>[];
  // [SourceFile.fileName][typeName] = mappedTypeName
  moduleTypeNameMap: Record<string, Record<string, string>>;
  // Counter used for generating temporary variable names.
  tempVariableIndex: int;
  // Placeholder for current block level statement
  blockLevelStatementPlaceholderStack: OutputWriter[];
}

interface EmitResult {
  code: string;
}

export function emit(program: ast.Program): EmitResult {
  const context: EmitContext = {
    entryFileName: program.entryFileName,
    output: makeOutputWriter(),
    outputStack: [],
    sourceFiles: program.sourceFiles,
    emittedSourceFiles: new Set<string>(),
    sourceFilePrefixes: {},
    namePrefixStack: [],
    importMap: [{}],
    moduleTypeNameMap: {},
    tempVariableIndex: 0,
    blockLevelStatementPlaceholderStack: [],
  };

  emitPreamble(context);

  const entrySourceFile = program.sourceFiles[program.entryFileName];

  emitSourceFile(context, entrySourceFile);

  context.output.appendLine(`/* ${dump(context.moduleTypeNameMap)} */`);

  return {
    code: context.output.toString(),
  };
}

function pushOutput(context: EmitContext, newOutput?: OutputWriter): OutputWriter {
  if (newOutput == undefined) {
    newOutput = makeOutputWriter({ indentLevel: context.output.indentLevel() });
  }

  context.outputStack.push(context.output);
  context.output = newOutput;

  return newOutput;
}

function popOutput(context: EmitContext): void {
  if (context.outputStack.length == 0) {
    throw new Error("context.outputStack is empty.");
  }

  const oldOutput = context.outputStack.pop() as OutputWriter;
  context.output = oldOutput;
}

function pushNamePrefix(context: EmitContext, prefix: string): void {
  context.namePrefixStack.push(prefix);
}

function popNamePrefix(context: EmitContext): void {
  if (context.namePrefixStack.length == 0) {
    throw new Error("context.namePrefixStack is empty.");
  }

  context.namePrefixStack.pop();
}

function getNamePrefix(context: EmitContext): string {
  if (context.namePrefixStack.length == 0) {
    return "";
  }

  // Only take the last prefix in the stack. The prefix is guarenteed to be unique.
  return "_" + context.namePrefixStack[context.namePrefixStack.length - 1] + "_";
}

function pushImportMap(context: EmitContext): void {
  context.importMap.push({});
}

function popImportMap(context: EmitContext): void {
  context.importMap.pop();
}

function getImportedModuleByAlias(context: EmitContext, moduleAlias: string): ast.SourceFile | null {
  return context.importMap[context.importMap.length - 1][moduleAlias] ?? null;
}

function setImportedModule(context: EmitContext, moduleAlias: string, sourceFile: ast.SourceFile): void {
  context.importMap[context.importMap.length - 1][moduleAlias] = sourceFile;
}

function mapModuleTypeName(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  typeName: string,
  mappedTypeName: string,
): void {
  if (!context.moduleTypeNameMap[sourceFile.fileName]) {
    context.moduleTypeNameMap[sourceFile.fileName] = {};
  }

  context.moduleTypeNameMap[sourceFile.fileName][typeName] = mappedTypeName;
}

function getMappedModuleTypeName(context: EmitContext, sourceFile: ast.SourceFile, typeName: string): string | null {
  if (!context.moduleTypeNameMap[sourceFile.fileName]) {
    return null;
  }

  return context.moduleTypeNameMap[sourceFile.fileName][typeName];
}

function pushBlockLevelStatementPlaceholder(context: EmitContext): OutputWriter {
  const newPlaceholder = makeOutputWriter({ indentLevel: context.output.indentLevel() });

  context.blockLevelStatementPlaceholderStack.push(newPlaceholder);

  return newPlaceholder;
}

function popBlockLevelStatementPlaceholder(context: EmitContext): void {
  if (context.blockLevelStatementPlaceholderStack.length == 0) {
    throw new Error("context.blockLevelStatementPlaceholderStack is empty.");
  }

  context.blockLevelStatementPlaceholderStack.pop();
}

function getBlockLevelStatementPlaceholder(context: EmitContext): OutputWriter {
  if (context.blockLevelStatementPlaceholderStack.length == 0) {
    throw new Error("context.blockLevelStatementPlaceholderStack is empty.");
  }

  return context.blockLevelStatementPlaceholderStack[context.blockLevelStatementPlaceholderStack.length - 1];
}

function generateTempVariableName(context: EmitContext, prefix: string): string {
  const index = context.tempVariableIndex;
  context.tempVariableIndex += 1;
  return `__${prefix}${index}`;
}

function getSourceFileOrError(node: ast.SyntaxNode): ast.SourceFile {
  const sourceFile = ast.findSourceFileFromNode(node);

  if (sourceFile == null) {
    throw new Error(
      `Failed to get ${ast.nameofSyntaxKind(ast.SyntaxKind.SourceFile)} from "${
        ast.nameofSyntaxKind(node.kind)
      }" at (${node.startPos.line}, ${node.startPos.column})`,
    );
  }

  return sourceFile;
}

function getSourceFileFromSymbol(context: EmitContext, symbol: ast.Symbol): ast.SourceFile {
  // TODO: It might make sense to have a <runtime> source file or something to that effect.
  if (hasFlag(symbol.flags, ast.SymbolFlags.Builtin)) {
    return context.sourceFiles[context.entryFileName];
  }

  if (!symbol.declaration) {
    throw new Error(`Symbol has no declaration in ${nameof(getSourceFileFromSymbol)}`);
  }

  const sourceFile = ast.findSourceFileFromNode(symbol.declaration);

  if (!sourceFile) {
    throw new Error(`Unable to find source file in ${nameof(getSourceFileFromSymbol)}`);
  }

  return sourceFile;
}

function emitPreamble(context: EmitContext): void {
  context.output.appendLine("#include <biggie.cpp>");
  context.output.appendLine();
}

function emitUnexpectedNode(
  context: EmitContext,
  functionName: string,
  node: ast.SyntaxNode,
): void {
  context.output.appendLine("/*");
  context.output.appendLine(`Unexpected node in ${functionName}:`);
  context.output.append(ast.nameofSyntaxKind(node.kind));
  context.output.appendLine("*/");
}

function emitSourceFile(context: EmitContext, sourceFile: ast.SourceFile): void {
  pushImportMap(context);

  // Emit import statements first.
  for (const statement of sourceFile.statements.filter((s) => s.kind == ast.SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, statement);
  }

  context.output.appendLine(`/* SourceFile: ${sourceFile.fileName} */`);
  context.output.appendLine();

  for (const statement of sourceFile.statements.filter((s) => s.kind != ast.SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, statement);
  }

  popImportMap(context);
  context.emittedSourceFiles.add(sourceFile.fileName);
}

function emitTopLevelStatement(context: EmitContext, node: ast.SyntaxNode): void {
  switch (node.kind) {
    case ast.SyntaxKind.ImportDeclaration:
      emitImportDeclaration(context, <ast.ImportDeclaration> node);
      break;

    case ast.SyntaxKind.EnumDeclaration:
      emitEnumDeclaration(context, <ast.EnumDeclaration> node);
      break;

    case ast.SyntaxKind.FuncDeclaration:
      emitFuncDeclaration(context, <ast.FuncDeclaration> node);
      break;

    case ast.SyntaxKind.MethodDeclaration:
      emitMethodDeclaration(context, <ast.MethodDeclaration> node);
      break;

    case ast.SyntaxKind.StructDeclaration:
      emitStructDeclaration(context, <ast.StructDeclaration> node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitTopLevelStatement), node);
      break;
  }
}

function emitImportDeclaration(context: EmitContext, importDeclaration: ast.ImportDeclaration): void {
  const resolvedSourceFile = context.sourceFiles[importDeclaration.resolvedFileName];

  if (!resolvedSourceFile) {
    throw new Error("resolvedSourceFile is null");
  }

  let sourceFilePrefix = context.sourceFilePrefixes[resolvedSourceFile.fileName];
  if (!context.emittedSourceFiles.has(resolvedSourceFile.fileName)) {
    sourceFilePrefix = ast.getModulePrefixByFileName(importDeclaration);
    let sourceFilePrefixIndex = 1;
    while (Object.values(context.sourceFilePrefixes).includes(sourceFilePrefix + sourceFilePrefixIndex)) {
      sourceFilePrefixIndex += 1;
    }

    sourceFilePrefix = sourceFilePrefix + sourceFilePrefixIndex;
    context.sourceFilePrefixes[resolvedSourceFile.fileName] = sourceFilePrefix;
    pushNamePrefix(context, sourceFilePrefix);
    emitSourceFile(context, resolvedSourceFile);
    popNamePrefix(context);
  }

  if (importDeclaration.alias) {
    setImportedModule(context, importDeclaration.alias.value, resolvedSourceFile);
  } else {
    const sourceFile = getSourceFileOrError(importDeclaration);
    for (const key of Object.keys(resolvedSourceFile.exports)) {
      // TODO: Inserting the "_"(s) here feels wrong, have some function that we can use.
      mapModuleTypeName(context, sourceFile, key, "_" + sourceFilePrefix + "_" + key);
    }
  }
}

function emitEnumDeclaration(context: EmitContext, enumDeclaration: ast.EnumDeclaration): void {
  const sourceFile = getSourceFileOrError(enumDeclaration);
  const mappedEnumName = getNamePrefix(context) + enumDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, enumDeclaration.name.value, mappedEnumName);

  context.output.appendLine(`enum ${mappedEnumName} {`);

  context.output.indent();
  for (const member of enumDeclaration.members) {
    context.output.append(`${mappedEnumName}_${member.name.value}`);

    if (member.initializer) {
      context.output.append(" = ");
      emitExpression(context, member.initializer);
    }

    context.output.appendLine(",");
  }
  context.output.unindent();

  context.output.appendLine("};");
  context.output.appendLine();
}

function emitFuncDeclaration(context: EmitContext, funcDeclaration: ast.FuncDeclaration): void {
  emitType(context, funcDeclaration.returnType);

  const sourceFile = getSourceFileOrError(funcDeclaration);
  const mappedFunctionName = getNamePrefix(context) + funcDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, funcDeclaration.name.value, mappedFunctionName);

  context.output.append(` ${mappedFunctionName}(`);

  for (let i = 0; i < funcDeclaration.args.length; i++) {
    const arg = funcDeclaration.args[i];

    if (i != 0) {
      context.output.append(", ");
    }

    emitType(context, arg.declaredType);
    context.output.append(` ${arg.name.value}`);
  }

  context.output.append(") ");

  emitStatementBlock(context, funcDeclaration.body);

  context.output.appendLine();
}

function emitMethodDeclaration(context: EmitContext, methodDeclaration: ast.MethodDeclaration): void {
  emitType(context, methodDeclaration.returnType);

  let mappedFunctionName = "";
  if (ast.isQualifiedName(methodDeclaration.receiver.declaredType.typeName)) {
    const module = getImportedModuleByAlias(context, methodDeclaration.receiver.declaredType.typeName.left.value);

    let mappedReceiverName = "";

    if (module) {
      mappedReceiverName = getMappedModuleTypeName(
        context,
        module,
        ast.getSymbol(methodDeclaration.receiver.declaredType.typeName.right, ast.SymbolKind.Struct).name,
      ) ?? "";

      mappedFunctionName = getNamePrefix(context) + mappedReceiverName + "_" + methodDeclaration.name.value;
      mapModuleTypeName(context, module, methodDeclaration.name.value, mappedFunctionName);
    }

    if (!mappedReceiverName) {
      mappedReceiverName = methodDeclaration.receiver.declaredType.typeName.left.value + "." +
        methodDeclaration.receiver.declaredType.typeName.right.value;
    }
  } else {
    const sourceFile = getSourceFileOrError(methodDeclaration);
    const mappedReceiverName = getMappedModuleTypeName(
      context,
      sourceFile,
      ast.getSymbol(methodDeclaration.receiver, ast.SymbolKind.MethodReceiver).name,
    )!;
    mappedFunctionName = getNamePrefix(context) + mappedReceiverName + "_" + methodDeclaration.name.value;
    mapModuleTypeName(context, sourceFile, methodDeclaration.name.value, mappedFunctionName);
  }

  context.output.append(` ${mappedFunctionName}(`);

  emitType(context, methodDeclaration.receiver.declaredType);
  context.output.append(` ${methodDeclaration.receiver.name.value}`);

  for (let i = 0; i < methodDeclaration.args.length; i++) {
    const arg = methodDeclaration.args[i];

    context.output.append(", ");

    emitType(context, arg.declaredType);
    context.output.append(` ${arg.name.value}`);
  }

  context.output.append(") ");

  emitStatementBlock(context, methodDeclaration.body);

  context.output.appendLine();
}

function emitStructDeclaration(context: EmitContext, structDeclaration: ast.StructDeclaration): void {
  const sourceFile = getSourceFileOrError(structDeclaration);
  const mappedStructName = getNamePrefix(context) + structDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, structDeclaration.name.value, mappedStructName);

  context.output.appendLine(`typedef struct ${mappedStructName} {`);

  context.output.indent();
  for (let i = 0; i < structDeclaration.members.length; i++) {
    const member = structDeclaration.members[i];
    const memberType = member.declaredType.value;
    const memberName = member.name.value;
    context.output.appendLine(`${memberType} ${memberName};`);
  }
  context.output.unindent();

  context.output.appendLine(`} ${mappedStructName};`);
  context.output.appendLine();
}

function emitStatementBlock(context: EmitContext, statementBlock: ast.StatementBlock): void {
  context.output.appendLine("{");
  context.output.indent();

  for (const statement of statementBlock.statements) {
    emitBlockLevelStatement(context, statement);
  }

  context.output.unindent();
  context.output.appendLine("}");
}

function emitBlockLevelStatement(context: EmitContext, node: ast.SyntaxNode): void {
  const placeholder = pushBlockLevelStatementPlaceholder(context);
  const statementOutput = pushOutput(context);

  switch (node.kind) {
    case ast.SyntaxKind.DeferStatement:
      emitDeferStatement(context, <ast.DeferStatement> node);
      break;

    case ast.SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, <ast.ExpressionStatement> node);
      break;

    case ast.SyntaxKind.IfStatement:
      emitIfStatement(context, <ast.IfStatement> node);
      break;

    case ast.SyntaxKind.ReturnStatement:
      emitReturnStatement(context, <ast.ReturnStatement> node);
      break;

    case ast.SyntaxKind.StatementBlock:
      emitStatementBlock(context, <ast.StatementBlock> node);
      break;

    case ast.SyntaxKind.VarDeclaration:
      emitVarDeclaration(context, <ast.VarDeclaration> node);
      break;

    case ast.SyntaxKind.WhileStatement:
      emitWhileStatement(context, <ast.WhileStatement> node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitBlockLevelStatement), node);
      break;
  }

  popOutput(context);
  popBlockLevelStatementPlaceholder(context);

  if (placeholder.hasContents()) {
    context.output.appendLine(placeholder.toString().trim());
  }

  context.output.appendLine(statementOutput.toString().trim());
}

function emitDeferStatement(context: EmitContext, deferStatement: ast.DeferStatement): void {
  context.output.append("defer ");

  if (deferStatement.body.kind !== ast.SyntaxKind.StatementBlock) {
    context.output.append("{ ");
  }

  emitBlockLevelStatement(context, deferStatement.body);

  if (deferStatement.body.kind !== ast.SyntaxKind.StatementBlock) {
    //context.remove(1);
    context.output.append(" }");
  }

  context.output.appendLine(";");
}

function emitExpressionStatement(context: EmitContext, expressionStatement: ast.ExpressionStatement): void {
  emitExpression(context, expressionStatement.expression);
  context.output.appendLine(";");
}

function emitIfStatement(context: EmitContext, ifStatement: ast.IfStatement): void {
  context.output.append("if (");
  emitExpression(context, ifStatement.condition);
  context.output.append(") ");
  emitBlockLevelStatement(context, ifStatement.then);

  if (ifStatement.else != null) {
    context.output.append(" else ");
    emitBlockLevelStatement(context, ifStatement.else);
  }

  context.output.appendLine();
}

function emitReturnStatement(context: EmitContext, returnStatement: ast.ReturnStatement): void {
  context.output.append("return ");

  if (returnStatement.expression != null) {
    emitExpression(context, returnStatement.expression);
  }

  context.output.appendLine(";");
}

function emitVarDeclaration(context: EmitContext, varDeclaration: ast.VarDeclaration): void {
  const emitTypeResult = emitType(context, varDeclaration.declaredType);
  context.output.append(" ");
  emitIdentifier(context, varDeclaration.name);

  for (let i = 0; i < emitTypeResult.arrayDepth; i++) {
    context.output.append("[]");
  }

  if (varDeclaration.initializer != null) {
    context.output.append(" = ");
    emitExpression(context, varDeclaration.initializer);
  }

  context.output.appendLine(";");
}

function emitWhileStatement(context: EmitContext, whileStatement: ast.WhileStatement): void {
  context.output.append("while (");
  emitExpression(context, whileStatement.condition);
  context.output.append(") ");
  emitBlockLevelStatement(context, whileStatement.body);
}

interface EmitTypeResult {
  arrayDepth: int;
}

function makeEmitTypeResult(): EmitTypeResult {
  return {
    arrayDepth: 0,
  };
}

function emitType(
  context: EmitContext,
  type: ast.TypeNode,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  switch (type.kind) {
    case ast.SyntaxKind.ArrayType:
      emitArrayType(context, type as ast.ArrayType, result);
      break;

    case ast.SyntaxKind.PointerType:
      emitPointerType(context, type as ast.PointerType, result);
      break;

    case ast.SyntaxKind.TypeReference:
      emitTypeReference(context, type as ast.TypeReference, result);
      break;
  }

  return result;
}

function emitArrayType(
  context: EmitContext,
  arrayType: ast.ArrayType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  result.arrayDepth += 1;
  emitType(context, arrayType.elementType, result);

  return result;
}

function emitPointerType(
  context: EmitContext,
  pointerType: ast.PointerType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  emitType(context, pointerType.elementType, result);
  context.output.append("*");

  return result;
}

function emitTypeReference(
  context: EmitContext,
  typeReference: ast.TypeReference,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  if (ast.isQualifiedName(typeReference.typeName)) {
    const module = getImportedModuleByAlias(context, typeReference.typeName.left.value);

    // TODO: emitIdentifier also does mapping, maybe this is unnecessary.
    let typeIsMapped = false;
    if (module != null) {
      const mappedTypeName = getMappedModuleTypeName(context, module, typeReference.typeName.right.value);

      if (mappedTypeName != null) {
        context.output.append(mappedTypeName);
        typeIsMapped = true;
      }
    }

    if (!typeIsMapped) {
      emitIdentifier(context, typeReference.typeName.left);
      context.output.append(".");
      emitIdentifier(context, typeReference.typeName.right);
    }
  } else {
    emitIdentifier(context, typeReference.typeName);
  }

  return result;
}

function emitExpression(context: EmitContext, expression: ast.Expression): void {
  switch (expression.kind) {
    case ast.SyntaxKind.AdditiveExpression:
      emitAdditiveExpression(context, <ast.AdditiveExpression> expression);
      break;

    case ast.SyntaxKind.ArrayLiteral:
      emitArrayLiteral(context, <ast.ArrayLiteral> expression);
      break;

    case ast.SyntaxKind.AssignmentExpression:
      emitAssignmentExpression(context, <ast.AssignmentExpression> expression);
      break;

    case ast.SyntaxKind.BoolLiteral:
      emitBooleanLiteral(context, <ast.BoolLiteral> expression);
      break;

    case ast.SyntaxKind.CallExpression:
      emitCallExpression(context, <ast.CallExpression> expression);
      break;

    case ast.SyntaxKind.ComparisonExpression:
      emitComparisonExpression(context, <ast.ComparisonExpression> expression);
      break;

    case ast.SyntaxKind.ElementAccessExpression:
      emitElementAccessExpression(context, <ast.ElementAccessExpression> expression);
      break;

    case ast.SyntaxKind.EqualityExpression:
      emitEqualityExpression(context, <ast.EqualityExpression> expression);
      break;

    case ast.SyntaxKind.Identifier:
      emitIdentifier(context, <ast.Identifier> expression);
      break;

    case ast.SyntaxKind.IntLiteral:
      emitIntegerLiteral(context, <ast.IntLiteral> expression);
      break;

    case ast.SyntaxKind.LogicalExpression:
      emitLogicalExpression(context, <ast.LogicalExpression> expression);
      break;

    case ast.SyntaxKind.MultiplicativeExpression:
      emitMultiplicativeExpression(context, <ast.MultiplicativeExpression> expression);
      break;

    case ast.SyntaxKind.ParenthesizedExpression:
      emitParenthesizedExpression(context, <ast.ParenthesizedExpression> expression);
      break;

    case ast.SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(context, <ast.PropertyAccessExpression> expression);
      break;

    case ast.SyntaxKind.StringLiteral:
      emitStringLiteral(context, <ast.StringLiteral> expression);
      break;

    case ast.SyntaxKind.StructLiteral:
      emitStructLiteral(context, <ast.StructLiteral> expression);
      break;

    case ast.SyntaxKind.UnaryExpression:
      emitUnaryExpression(context, <ast.UnaryExpression> expression);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitExpression), expression);
      break;
  }
}

function emitAssignmentExpression(context: EmitContext, expression: ast.AssignmentExpression): void {
  emitIdentifier(context, expression.name);

  let operator = "=";
  switch (expression.operator) {
    case ast.Operator.PlusEquals:
      operator = "+=";
      break;

    case ast.Operator.MinusEquals:
      operator = "-=";
      break;

    case ast.Operator.AsteriskEquals:
      operator = "*=";
      break;

    case ast.Operator.SlashEquals:
      operator = "/=";
      break;
  }

  context.output.append(` ${operator} `);

  emitExpression(context, expression.value);
}

function emitAdditiveExpression(context: EmitContext, expression: ast.AdditiveExpression): void {
  if (
    expression.operator == ast.Operator.Plus &&
    expression.lhs?.type?.name == "string" &&
    expression.rhs?.type?.name == "string"
  ) {
    context.output.append("STRING_CONCAT(");
    emitExpression(context, expression.lhs);
    context.output.append(", ");
    emitExpression(context, expression.rhs);
    context.output.append(")");
    return;
  }

  emitExpression(context, expression.lhs);
  context.output.append(` ${expression.operator == ast.Operator.Plus ? "+" : "-"} `);
  emitExpression(context, expression.rhs);
}

function emitArrayLiteral(context: EmitContext, arrayLiteral: ast.ArrayLiteral): void {
  context.output.append("{");

  for (let i = 0; i < arrayLiteral.elements.length; i += 1) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, arrayLiteral.elements[i]);
  }

  context.output.append("}");
}

function emitBooleanLiteral(context: EmitContext, boolLiteral: ast.BoolLiteral): void {
  context.output.append(boolLiteral.value ? "true" : "false");
}

function emitCallExpression(context: EmitContext, callExpression: ast.CallExpression): void {
  assert.notNull(
    callExpression.symbol,
    `Expected callExpression.symbol not to be null: ${ast.toString(callExpression)}`,
  );

  if (!ast.isSymbolCallable(callExpression.symbol)) {
    throw backendError(BackendErrorKind.Unexpected, "callExpression.symbol is not callable", callExpression);
  }

  const isVaradicCall = hasFlag(callExpression.symbol.flags, ast.SymbolFlags.Varadic);
  let varadicArgsArrayName = "";

  let beginVaradicArgsIndex = callExpression.args.length;
  if (isVaradicCall) {
    assert.notNull(
      callExpression.symbol.beginVaradicArgsIndex,
      `Expected callExpression.symbol.beginVaradicArgsIndex not be null when ${
        ast.nameofSymbolFlags(ast.SymbolFlags.Varadic)
      } is set`,
    );

    beginVaradicArgsIndex = callExpression.symbol.beginVaradicArgsIndex;

    if (callExpression.args.length > beginVaradicArgsIndex) {
      const placeholder = getBlockLevelStatementPlaceholder(context);
      pushOutput(context, placeholder);

      const varadicVariableNames: string[] = [];
      for (let i = beginVaradicArgsIndex; i < callExpression.args.length; i += 1) {
        const varadicVariableName = generateTempVariableName(context, "v");
        varadicVariableNames.push(varadicVariableName);

        context.output.append(`auto ${varadicVariableName} = `);
        emitExpression(context, callExpression.args[i]);
        context.output.appendLine(";");
      }

      varadicArgsArrayName = generateTempVariableName(context, "vargs");
      context.output.append(`void* ${varadicArgsArrayName}[] = {`);
      context.output.append(varadicVariableNames.map((x) => `&${x}`).join(", "));
      context.output.appendLine("};");

      popOutput(context);
    }
  }

  // Copy the arguments into a new array, if we have a method we'll push the receiver
  // into the front of the array.
  const args = [...callExpression.args];

  if (callExpression.symbol.kind == ast.SymbolKind.Method) {
    if (!ast.isPropertyAccessExpression(callExpression.expression)) {
      throw new Error(
        `Expected callExpression.expression to be kind ${
          ast.nameofSyntaxKind(ast.SyntaxKind.PropertyAccessExpression)
        } when ${ast.nameofSymbolKind(ast.SymbolKind.Method)} is set`,
      );
    }

    assert.notNull(
      callExpression.expression.expression.type,
      "Expected callExpression.expression.expression.type (receiver) not to be null",
    );
    const receiver = callExpression.expression.expression.type;

    const module = getSourceFileFromSymbol(context, receiver);
    const mappedFunctionName = getMappedModuleTypeName(context, module, callExpression.expression.name.value);

    if (mappedFunctionName) {
      context.output.append(mappedFunctionName);
    } else {
      // FIXME: This leads to only one method can be set per name.
      emitIdentifier(context, callExpression.expression.name);
    }

    args.unshift(callExpression.expression.expression);
    beginVaradicArgsIndex += 1;
  } else {
    emitExpression(context, callExpression.expression);
  }
  context.output.append("(");

  for (let i = 0; i < beginVaradicArgsIndex; i += 1) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, args[i]);
  }

  if (isVaradicCall && varadicArgsArrayName) {
    if (beginVaradicArgsIndex != 0) {
      context.output.append(", ");
    }

    context.output.append(varadicArgsArrayName);
  }

  context.output.append(")");
}

function emitElementAccessExpression(context: EmitContext, elementAccessExpression: ast.ElementAccessExpression): void {
  emitExpression(context, elementAccessExpression.expression);
  context.output.append("[");
  emitExpression(context, elementAccessExpression.argumentExpression);
  context.output.append("]");
}

function emitPropertyAccessExpression(
  context: EmitContext,
  propertyAccessExpression: ast.PropertyAccessExpression,
): void {
  if (propertyAccessExpression.expression.symbol) {
    if (propertyAccessExpression.expression.symbol.kind == ast.SymbolKind.Import) {
      const module = getImportedModuleByAlias(context, propertyAccessExpression.expression.symbol.name);

      if (module != null) {
        const mappedTypeName = getMappedModuleTypeName(context, module, propertyAccessExpression.name.value);

        if (mappedTypeName != null) {
          context.output.append(mappedTypeName);
          return;
        }
      }
    } else if (propertyAccessExpression.expression.symbol.kind == ast.SymbolKind.Enum) {
      const module = getSourceFileFromSymbol(context, propertyAccessExpression.expression.symbol);
      const mappedTypeName = getMappedModuleTypeName(context, module, propertyAccessExpression.expression.symbol.name);
      if (mappedTypeName != null) {
        context.output.append(`${mappedTypeName}_`);
        emitIdentifier(context, propertyAccessExpression.name);
        return;
      }
    } else {
      emitExpression(context, propertyAccessExpression.expression);
      context.output.append(".");
    }
  } else {
    // TODO: Just make this branch an error.
    emitExpression(context, propertyAccessExpression.expression);
    context.output.append(".");
  }

  emitIdentifier(context, propertyAccessExpression.name);
}

function emitComparisonExpression(
  context: EmitContext,
  expression: ast.ComparisonExpression,
) {
  emitExpression(context, expression.lhs);

  let operator = ">";

  switch (expression.operator) {
    case ast.Operator.GreaterThan:
      operator = ">";
      break;

    case ast.Operator.GreaterThanEquals:
      operator = ">=";
      break;

    case ast.Operator.LessThan:
      operator = "<";
      break;

    case ast.Operator.LessThanEquals:
      operator = "<=";
      break;
  }

  context.output.append(` ${operator} `);

  emitExpression(context, expression.rhs);
}

function emitEqualityExpression(context: EmitContext, expression: ast.EqualityExpression) {
  emitExpression(context, expression.lhs);
  context.output.append(expression.operator == ast.Operator.EqualsEquals ? " == " : " != ");
  emitExpression(context, expression.rhs);
}

function emitIdentifier(context: EmitContext, identifier: ast.Identifier) {
  if (identifier.symbol && hasFlag(identifier.symbol.flags, ast.SymbolFlags.Builtin)) {
    emitBuiltin(context, identifier);
    return;
  }

  const sourceFile = getSourceFileOrError(identifier);
  const mappedName = getMappedModuleTypeName(context, sourceFile, identifier.value);

  if (mappedName) {
    context.output.append(mappedName);
  } else {
    context.output.append(identifier.value);
  }
}

function emitBuiltin(context: EmitContext, identifier: ast.Identifier): void {
  if (
    !identifier.symbol ||
    !hasFlag(identifier.symbol.flags, ast.SymbolFlags.Builtin)
  ) {
    context.output.append(`/* ${identifier.value} is not a builtin */ ${identifier.value}`);
    return;
  }

  let name = ast.getQualifiedNameForSymbol(identifier.symbol);

  // TODO: This should just be a lookup table somewhere.
  switch (name) {
    case "Array.length":
      name = "ARRAY_LENGTH";
      break;

    case "string.length":
      name = "STRING_LENGTH";
      break;
  }

  context.output.append(name);
}

function emitIntegerLiteral(context: EmitContext, intLiteral: ast.IntLiteral) {
  context.output.append(intLiteral.value);
}

function emitLogicalExpression(context: EmitContext, expression: ast.LogicalExpression) {
  emitExpression(context, expression.lhs);
  context.output.append(expression.operator == ast.Operator.AmpersandAmpersand ? " && " : " || ");
  emitExpression(context, expression.rhs);
}

function emitMultiplicativeExpression(context: EmitContext, expression: ast.MultiplicativeExpression): void {
  emitExpression(context, expression.lhs);
  context.output.append(expression.operator == ast.Operator.Asterisk ? " * " : " / ");
  emitExpression(context, expression.rhs);
}

function emitParenthesizedExpression(context: EmitContext, expression: ast.ParenthesizedExpression): void {
  context.output.append("(");
  emitExpression(context, expression.expression);
  context.output.append(")");
}

function emitStringLiteral(context: EmitContext, stringLiteral: ast.StringLiteral): void {
  context.output.append(`"${stringLiteral.value}"`);
}

function emitStructLiteral(context: EmitContext, structLiteral: ast.StructLiteral): void {
  context.output.appendLine("{");
  context.output.indent();

  // Parser ensures that all elements are either named or unnanmed.
  const elementsAreNamed = structLiteral.elements.some((element) => element.name);
  const elementTempVariableMap: Record<string, string> = {};

  for (const element of structLiteral.elements) {
    // If the elements are named we need to order the elements correctly in order to
    // prevent a warning in the compiler so build a map now and output it later.
    if (elementsAreNamed) {
      const placeholder = getBlockLevelStatementPlaceholder(context);
      pushOutput(context, placeholder);

      const elementTempVariable = generateTempVariableName(context, "e");

      context.output.append(`auto ${elementTempVariable} = `);
      emitExpression(context, element.expression);
      context.output.appendLine(";");

      popOutput(context);

      assert.notNull(element.name, "Expected element.name not to be null.");
      elementTempVariableMap[element.name.value] = elementTempVariable;
    } else {
      emitExpression(context, element.expression);
      context.output.appendLine(",");
    }
  }

  if (elementsAreNamed) {
    assert.notNull(structLiteral.type, "Expected structLiteral.type not to be null.");
    assert.notNull(structLiteral.type.declaration, "Expected structLiteral.type.declaration not to be null.");

    if (!ast.isStructDeclaration(structLiteral.type.declaration)) {
      assert.fail(
        `Expected structLiteral.type.declaration not to be ${ast.nameofSyntaxKind(ast.SyntaxKind.StructDeclaration)}.`,
      );
    }

    for (const member of structLiteral.type.declaration.members) {
      context.output.appendLine(`.${member.name.value} = ${elementTempVariableMap[member.name.value]},`);
    }
  }

  context.output.unindent();
  context.output.append("}");
}

function emitUnaryExpression(context: EmitContext, expression: ast.UnaryExpression) {
  switch (expression.operator) {
    case ast.Operator.Ampersand:
      context.output.append("&");
      break;
    case ast.Operator.Asterisk:
      context.output.append("*");
      break;
    case ast.Operator.Exclamation:
      context.output.append("!");
      break;
    case ast.Operator.Minus:
      context.output.append("-");
      break;
    default:
      emitUnexpectedNode(context, nameof(emitUnaryExpression), expression);
      break;
  }

  emitExpression(context, expression.expression);
}
