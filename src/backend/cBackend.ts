import * as assert from "../assert.ts";
import * as ast from "../ast/mod.ts";
import { hasFlag, int, nameof } from "../shims.ts";
import { OutputWriter } from "../outputWriter.ts";
import { dump } from "../utils.ts";

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
  tmpVariableIndex: int;
  // Placeholder for current block level statement
  blockLevelStatementPlaceholderStack: OutputWriter[];
}

interface EmitResult {
  code: string;
}

export function emit(program: ast.Program): EmitResult {
  const context: EmitContext = {
    entryFileName: program.entryFileName,
    output: new OutputWriter(),
    outputStack: [],
    sourceFiles: program.sourceFiles,
    emittedSourceFiles: new Set<string>(),
    sourceFilePrefixes: {},
    namePrefixStack: [],
    importMap: [{}],
    moduleTypeNameMap: {},
    tmpVariableIndex: 0,
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
    newOutput = new OutputWriter();
    newOutput.setIndentLevel(context.output.indentLevel);
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
  const newPlaceholder = new OutputWriter();
  newPlaceholder.setIndentLevel(context.output.indentLevel);

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
  context.output.appendLine("#include <biggie.c>");
  context.output.appendLine();
}

function emitUnexpectedNode(
  context: EmitContext,
  functionName: string,
  sourceFile: ast.SourceFile,
  node: ast.SyntaxNode,
): void {
  context.output.appendLine("/*");
  context.output.appendLine(`Unexpected node in ${functionName}:`);
  context.output.append(`${sourceFile.fileName} ${ast.SyntaxKind[node.kind]}`);
  context.output.appendLine("*/");
}

function emitSourceFile(context: EmitContext, sourceFile: ast.SourceFile): void {
  pushImportMap(context);

  // Emit import statements first.
  for (const statement of sourceFile.statements.filter((s) => s.kind == ast.SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, sourceFile, statement);
  }

  context.output.appendLine(`/* SourceFile: ${sourceFile.fileName} */`);
  context.output.appendLine();

  for (const statement of sourceFile.statements.filter((s) => s.kind != ast.SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, sourceFile, statement);
  }

  popImportMap(context);
  context.emittedSourceFiles.add(sourceFile.fileName);
}

function emitTopLevelStatement(context: EmitContext, sourceFile: ast.SourceFile, node: ast.SyntaxNode): void {
  switch (node.kind) {
    case ast.SyntaxKind.ImportDeclaration:
      emitImportDeclaration(context, sourceFile, <ast.ImportDeclaration> node);
      break;

    case ast.SyntaxKind.EnumDeclaration:
      emitEnumDeclaration(context, sourceFile, <ast.EnumDeclaration> node);
      break;

    case ast.SyntaxKind.FuncDeclaration:
      emitFuncDeclaration(context, sourceFile, <ast.FuncDeclaration> node);
      break;

    case ast.SyntaxKind.MethodDeclaration:
      emitMethodDeclaration(context, sourceFile, <ast.MethodDeclaration> node);
      break;

    case ast.SyntaxKind.StructDeclaration:
      emitStructDeclaration(context, sourceFile, <ast.StructDeclaration> node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitTopLevelStatement), sourceFile, node);
      break;
  }
}

function emitImportDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  importDeclaration: ast.ImportDeclaration,
): void {
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
    for (const key of Object.keys(resolvedSourceFile.exports)) {
      // TODO: Inserting the "_"(s) here feels wrong, have some function that we can use.
      mapModuleTypeName(context, sourceFile, key, "_" + sourceFilePrefix + "_" + key);
    }
  }
}

function emitEnumDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  enumDeclaration: ast.EnumDeclaration,
): void {
  const mappedEnumName = getNamePrefix(context) + enumDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, enumDeclaration.name.value, mappedEnumName);

  context.output.appendLine("typedef enum {");

  context.output.indent();
  for (const member of enumDeclaration.members) {
    context.output.append(`${mappedEnumName}_${member.name.value}`);

    if (member.initializer) {
      context.output.append(" = ");
      emitExpression(context, sourceFile, member.initializer);
    }

    context.output.appendLine(",");
  }
  context.output.unindent();

  context.output.append(`} ${mappedEnumName};`);
  context.output.appendLine();
  context.output.appendLine();
}

function emitFuncDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  funcDeclaration: ast.FuncDeclaration,
): void {
  emitType(context, sourceFile, funcDeclaration.returnType);

  const mappedFunctionName = getNamePrefix(context) + funcDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, funcDeclaration.name.value, mappedFunctionName);

  context.output.append(` ${mappedFunctionName}(`);

  for (let i = 0; i < funcDeclaration.args.length; i++) {
    const arg = funcDeclaration.args[i];

    if (i != 0) {
      context.output.append(", ");
    }

    emitType(context, sourceFile, arg.declaredType);
    context.output.append(` ${arg.name.value}`);
  }

  context.output.append(") ");

  emitStatementBlock(context, sourceFile, funcDeclaration.body);

  context.output.appendLine();
}

function emitMethodDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  methodDeclaration: ast.MethodDeclaration,
): void {
  emitType(context, sourceFile, methodDeclaration.returnType);

  let mappedFunctionName = "";
  if (ast.isQualifiedName(methodDeclaration.receiver.declaredType.typeName)) {
    const module = getImportedModuleByAlias(context, methodDeclaration.receiver.declaredType.typeName.left.value);

    let mappedReceiverName = "";

    if (module) {
      mappedReceiverName = getMappedModuleTypeName(
        context,
        module,
        ast.getSymbol(methodDeclaration.receiver.declaredType.typeName.right, ast.SymbolFlags.Type).name,
      ) ?? "";

      mappedFunctionName = getNamePrefix(context) + mappedReceiverName + "_" + methodDeclaration.name.value;
      mapModuleTypeName(context, module, methodDeclaration.name.value, mappedFunctionName);
    }

    if (!mappedReceiverName) {
      mappedReceiverName = methodDeclaration.receiver.declaredType.typeName.left.value + "." +
        methodDeclaration.receiver.declaredType.typeName.right.value;
    }
  } else {
    const mappedReceiverName = getMappedModuleTypeName(
      context,
      sourceFile,
      ast.getSymbol(methodDeclaration.receiver.declaredType, ast.SymbolFlags.Struct).name,
    )!;
    mappedFunctionName = getNamePrefix(context) + mappedReceiverName + "_" + methodDeclaration.name.value;
    mapModuleTypeName(context, sourceFile, methodDeclaration.name.value, mappedFunctionName);
  }

  context.output.append(` ${mappedFunctionName}(`);

  emitType(context, sourceFile, methodDeclaration.receiver.declaredType);
  context.output.append(` ${methodDeclaration.receiver.name.value}`);

  for (let i = 0; i < methodDeclaration.args.length; i++) {
    const arg = methodDeclaration.args[i];

    context.output.append(", ");

    emitType(context, sourceFile, arg.declaredType);
    context.output.append(` ${arg.name.value}`);
  }

  context.output.append(") ");

  emitStatementBlock(context, sourceFile, methodDeclaration.body);

  context.output.appendLine();
}

function emitStructDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  structDeclaration: ast.StructDeclaration,
): void {
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

function emitStatementBlock(context: EmitContext, sourceFile: ast.SourceFile, statementBlock: ast.StatementBlock) {
  context.output.appendLine("{");
  context.output.indent();

  for (const statement of statementBlock.statements) {
    emitBlockLevelStatement(context, sourceFile, statement);
  }

  context.output.unindent();
  context.output.appendLine("}");
}

function emitBlockLevelStatement(context: EmitContext, sourceFile: ast.SourceFile, node: ast.SyntaxNode) {
  const placeholder = pushBlockLevelStatementPlaceholder(context);
  const statementOutput = pushOutput(context);

  switch (node.kind) {
    case ast.SyntaxKind.DeferStatement:
      emitDeferStatement(context, sourceFile, <ast.DeferStatement> node);
      break;

    case ast.SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, sourceFile, <ast.ExpressionStatement> node);
      break;

    case ast.SyntaxKind.IfStatement:
      emitIfStatement(context, sourceFile, <ast.IfStatement> node);
      break;

    case ast.SyntaxKind.ReturnStatement:
      emitReturnStatement(context, sourceFile, <ast.ReturnStatement> node);
      break;

    case ast.SyntaxKind.StatementBlock:
      emitStatementBlock(context, sourceFile, <ast.StatementBlock> node);
      break;

    case ast.SyntaxKind.VarDeclaration:
      emitVarDeclaration(context, sourceFile, <ast.VarDeclaration> node);
      break;

    case ast.SyntaxKind.WhileStatement:
      emitWhileStatement(context, sourceFile, <ast.WhileStatement> node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitBlockLevelStatement), sourceFile, node);
      break;
  }

  popOutput(context);
  popBlockLevelStatementPlaceholder(context);

  if (placeholder.hasContents) {
    context.output.appendLine(placeholder.toString().trim());
  }

  context.output.appendLine(statementOutput.toString().trim());
}

function emitDeferStatement(context: EmitContext, sourceFile: ast.SourceFile, deferStatement: ast.DeferStatement) {
  context.output.append("defer ");

  if (deferStatement.body.kind !== ast.SyntaxKind.StatementBlock) {
    context.output.append("{ ");
  }

  emitBlockLevelStatement(context, sourceFile, deferStatement.body);

  if (deferStatement.body.kind !== ast.SyntaxKind.StatementBlock) {
    //context.remove(1);
    context.output.append(" }");
  }

  context.output.appendLine(";");
}

function emitExpressionStatement(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expressionStatement: ast.ExpressionStatement,
) {
  emitExpression(context, sourceFile, expressionStatement.expression);
  context.output.appendLine(";");
}

function emitIfStatement(context: EmitContext, sourceFile: ast.SourceFile, ifStatement: ast.IfStatement) {
  context.output.append("if (");
  emitExpression(context, sourceFile, ifStatement.condition);
  context.output.append(") ");
  emitBlockLevelStatement(context, sourceFile, ifStatement.then);

  if (ifStatement.else != null) {
    context.output.append(" else ");
    emitBlockLevelStatement(context, sourceFile, ifStatement.else);
  }

  context.output.appendLine();
}

function emitReturnStatement(context: EmitContext, sourceFile: ast.SourceFile, returnStatement: ast.ReturnStatement) {
  context.output.append("return ");

  if (returnStatement.expression != null) {
    emitExpression(context, sourceFile, returnStatement.expression);
  }

  context.output.appendLine(";");
}

function emitVarDeclaration(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  variableDeclaration: ast.VarDeclaration,
) {
  const emitTypeResult = emitType(context, sourceFile, variableDeclaration.declaredType);
  context.output.append(" ");
  emitIdentifier(context, sourceFile, variableDeclaration.name);

  for (let i = 0; i < emitTypeResult.arrayDepth; i++) {
    context.output.append("[]");
  }

  if (variableDeclaration.initializer != null) {
    context.output.append(" = ");
    emitExpression(context, sourceFile, variableDeclaration.initializer);
  }

  context.output.appendLine(";");
}

function emitWhileStatement(context: EmitContext, sourceFile: ast.SourceFile, whileStatement: ast.WhileStatement) {
  context.output.append("while (");
  emitExpression(context, sourceFile, whileStatement.condition);
  context.output.append(") ");
  emitBlockLevelStatement(context, sourceFile, whileStatement.body);
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
  sourceFile: ast.SourceFile,
  type: ast.TypeNode,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  switch (type.kind) {
    case ast.SyntaxKind.ArrayType:
      emitArrayType(context, sourceFile, type as ast.ArrayType, result);
      break;

    case ast.SyntaxKind.PointerType:
      emitPointerType(context, sourceFile, type as ast.PointerType, result);
      break;

    case ast.SyntaxKind.TypeReference:
      emitTypeReference(context, sourceFile, type as ast.TypeReference, result);
      break;
  }

  return result;
}

function emitArrayType(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  arrayType: ast.ArrayType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  result.arrayDepth += 1;
  emitType(context, sourceFile, arrayType.elementType, result);

  return result;
}

function emitPointerType(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  pointerType: ast.PointerType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = makeEmitTypeResult();
  }

  emitType(context, sourceFile, pointerType.elementType, result);
  context.output.append("*");

  return result;
}

function emitTypeReference(
  context: EmitContext,
  sourceFile: ast.SourceFile,
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
      emitIdentifier(context, sourceFile, typeReference.typeName.left);
      context.output.append(".");
      emitIdentifier(context, sourceFile, typeReference.typeName.right);
    }
  } else {
    emitIdentifier(context, sourceFile, typeReference.typeName);
  }

  return result;
}

function emitExpression(context: EmitContext, sourceFile: ast.SourceFile, expression: ast.Expression) {
  switch (expression.kind) {
    case ast.SyntaxKind.AdditiveExpression:
      emitAdditiveExpression(context, sourceFile, <ast.AdditiveExpression> expression);
      break;

    case ast.SyntaxKind.ArrayLiteral:
      emitArrayLiteral(context, sourceFile, <ast.ArrayLiteral> expression);
      break;

    case ast.SyntaxKind.AssignmentExpression:
      emitAssignmentExpression(context, sourceFile, <ast.AssignmentExpression> expression);
      break;

    case ast.SyntaxKind.BoolLiteral:
      emitBooleanLiteral(context, sourceFile, <ast.BoolLiteral> expression);
      break;

    case ast.SyntaxKind.CallExpression:
      emitCallExpression(context, sourceFile, <ast.CallExpression> expression);
      break;

    case ast.SyntaxKind.ComparisonExpression:
      emitComparisonExpression(context, sourceFile, <ast.ComparisonExpression> expression);
      break;

    case ast.SyntaxKind.ElementAccessExpression:
      emitElementAccessExpression(context, sourceFile, <ast.ElementAccessExpression> expression);
      break;

    case ast.SyntaxKind.EqualityExpression:
      emitEqualityExpression(context, sourceFile, <ast.EqualityExpression> expression);
      break;

    case ast.SyntaxKind.Identifier:
      emitIdentifier(context, sourceFile, <ast.Identifier> expression);
      break;

    case ast.SyntaxKind.IntLiteral:
      emitIntegerLiteral(context, sourceFile, <ast.IntLiteral> expression);
      break;

    case ast.SyntaxKind.LogicalExpression:
      emitLogicalExpression(context, sourceFile, <ast.LogicalExpression> expression);
      break;

    case ast.SyntaxKind.MultiplicativeExpression:
      emitMultiplicativeExpression(context, sourceFile, <ast.MultiplicativeExpression> expression);
      break;

    case ast.SyntaxKind.ParenthesizedExpression:
      emitParenthesizedExpression(context, sourceFile, <ast.ParenthesizedExpression> expression);
      break;

    case ast.SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(context, sourceFile, <ast.PropertyAccessExpression> expression);
      break;

    case ast.SyntaxKind.StringLiteral:
      emitStringLiteral(context, sourceFile, <ast.StringLiteral> expression);
      break;

    case ast.SyntaxKind.StructLiteral:
      emitStructLiteral(context, sourceFile, <ast.StructLiteral> expression);
      break;

    case ast.SyntaxKind.UnaryExpression:
      emitUnaryExpression(context, sourceFile, <ast.UnaryExpression> expression);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitExpression), sourceFile, expression);
      break;
  }
}

function emitAssignmentExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expression: ast.AssignmentExpression,
): void {
  emitIdentifier(context, sourceFile, expression.name);

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

  emitExpression(context, sourceFile, expression.value);
}

function emitAdditiveExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expression: ast.AdditiveExpression,
): void {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(` ${expression.operator == ast.Operator.Plus ? "+" : "-"} `);

  emitExpression(context, sourceFile, expression.rhs);
}

function emitArrayLiteral(context: EmitContext, sourceFile: ast.SourceFile, arrayLiteral: ast.ArrayLiteral) {
  context.output.append("{");

  for (let i = 0; i < arrayLiteral.elements.length; i += 1) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, sourceFile, arrayLiteral.elements[i]);
  }

  context.output.append("}");
}

function emitBooleanLiteral(context: EmitContext, sourceFile: ast.SourceFile, booleanLiteral: ast.BoolLiteral) {
  context.output.append(booleanLiteral.value ? "true" : "false");
}

function emitCallExpression(context: EmitContext, sourceFile: ast.SourceFile, callExpression: ast.CallExpression) {
  assert.notNull(
    callExpression.symbol,
    `Expected callExpression.symbol not to be null`,
  );

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

    const placeholder = getBlockLevelStatementPlaceholder(context);
    pushOutput(context, placeholder);

    const varadicVariableNames: string[] = [];
    for (let i = beginVaradicArgsIndex; i < callExpression.args.length; i += 1) {
      const varadicVariableName = `__v${context.tmpVariableIndex++}`;
      varadicVariableNames.push(varadicVariableName);
      // TODO: Would be nice if we didn't have to use 'auto' here.
      context.output.append(`auto ${varadicVariableName} = `);
      emitExpression(context, sourceFile, callExpression.args[i]);
      context.output.appendLine(";");
    }

    varadicArgsArrayName = `__vargs${context.tmpVariableIndex++}`;
    context.output.append(`void* ${varadicArgsArrayName}[] = {`);
    context.output.append(varadicVariableNames.map((x) => `&${x}`).join(", "));
    context.output.appendLine("};");

    popOutput(context);
  }

  // Copy the arguments into a new array, if we have a method we'll push the receiver
  // into the front of the array.
  const args = [...callExpression.args];

  if (hasFlag(callExpression.symbol.flags, ast.SymbolFlags.Method)) {
    if (!ast.isPropertyAccessExpression(callExpression.expression)) {
      throw new Error(
        `Expected callExpression.expression to be kind ${
          ast.nameofSyntaxKind(ast.SyntaxKind.PropertyAccessExpression)
        } when ${ast.nameofSymbolFlags(ast.SymbolFlags.Method)} is set`,
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
      emitIdentifier(context, sourceFile, callExpression.expression.name);
    }

    args.unshift(callExpression.expression.expression);
    beginVaradicArgsIndex += 1;
  } else {
    emitExpression(context, sourceFile, callExpression.expression);
  }
  context.output.append("(");

  for (let i = 0; i < beginVaradicArgsIndex; i += 1) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, sourceFile, args[i]);
  }

  if (isVaradicCall) {
    if (beginVaradicArgsIndex != 0) {
      context.output.append(", ");
    }
    context.output.append(varadicArgsArrayName);
  }

  context.output.append(")");
}

function emitElementAccessExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  elementAccessExpression: ast.ElementAccessExpression,
) {
  emitExpression(context, sourceFile, elementAccessExpression.expression);
  context.output.append("[");
  emitExpression(context, sourceFile, elementAccessExpression.argumentExpression);
  context.output.append("]");
}

function emitPropertyAccessExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  propertyAccessExpression: ast.PropertyAccessExpression,
) {
  if (propertyAccessExpression.expression.symbol) {
    if (hasFlag(propertyAccessExpression.expression.symbol.flags, ast.SymbolFlags.Module)) {
      const module = getImportedModuleByAlias(context, propertyAccessExpression.expression.symbol.name);

      if (module != null) {
        const mappedTypeName = getMappedModuleTypeName(context, module, propertyAccessExpression.name.value);

        if (mappedTypeName != null) {
          context.output.append(mappedTypeName);
          return;
        }
      }
    } else if (hasFlag(propertyAccessExpression.expression.symbol.flags, ast.SymbolFlags.Enum)) {
      const module = getSourceFileFromSymbol(context, propertyAccessExpression.expression.symbol);
      const mappedTypeName = getMappedModuleTypeName(context, module, propertyAccessExpression.expression.symbol.name);
      if (mappedTypeName != null) {
        context.output.append(`${mappedTypeName}_`);
        emitIdentifier(context, sourceFile, propertyAccessExpression.name);
        return;
      }
    } else {
      emitExpression(context, sourceFile, propertyAccessExpression.expression);
      context.output.append(".");
    }
  } else {
    // TODO: Just make this branch an error.
    emitExpression(context, sourceFile, propertyAccessExpression.expression);
    context.output.append(".");
  }

  emitIdentifier(context, sourceFile, propertyAccessExpression.name);
}

function emitComparisonExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expression: ast.ComparisonExpression,
) {
  emitExpression(context, sourceFile, expression.lhs);

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

  emitExpression(context, sourceFile, expression.rhs);
}

function emitEqualityExpression(context: EmitContext, sourceFile: ast.SourceFile, expression: ast.EqualityExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(expression.operator == ast.Operator.EqualsEquals ? " == " : " != ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitIdentifier(context: EmitContext, sourceFile: ast.SourceFile, identifier: ast.Identifier) {
  if (identifier.symbol && hasFlag(identifier.symbol.flags, ast.SymbolFlags.Builtin)) {
    emitBuiltin(context, sourceFile, identifier);
    return;
  }

  const mappedName = getMappedModuleTypeName(context, sourceFile, identifier.value);

  if (mappedName) {
    context.output.append(mappedName);
  } else {
    context.output.append(identifier.value);
  }
}

function emitBuiltin(context: EmitContext, sourceFile: ast.SourceFile, identifier: ast.Identifier): void {
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

function emitIntegerLiteral(context: EmitContext, sourceFile: ast.SourceFile, integerLiteral: ast.IntLiteral) {
  context.output.append(integerLiteral.value);
}

function emitLogicalExpression(context: EmitContext, sourceFile: ast.SourceFile, expression: ast.LogicalExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(expression.operator == ast.Operator.AmpersandAmpersand ? " && " : " || ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitMultiplicativeExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expression: ast.MultiplicativeExpression,
) {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(expression.operator == ast.Operator.Asterisk ? " * " : " / ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitParenthesizedExpression(
  context: EmitContext,
  sourceFile: ast.SourceFile,
  expression: ast.ParenthesizedExpression,
) {
  context.output.append("(");
  emitExpression(context, sourceFile, expression.expression);
  context.output.append(")");
}

function emitStringLiteral(context: EmitContext, sourceFile: ast.SourceFile, stringLiteral: ast.StringLiteral) {
  context.output.append(`STRING("${stringLiteral.value}")`);
}

function emitStructLiteral(context: EmitContext, sourceFile: ast.SourceFile, structLiteral: ast.StructLiteral) {
  context.output.appendLine("{");
  context.output.indent();

  for (const element of structLiteral.elements) {
    if (element.name) {
      context.output.append(`.${element.name.value} = `);
    }

    emitExpression(context, sourceFile, element.expression);

    context.output.appendLine(",");
  }

  context.output.unindent();
  context.output.append("}");
}

function emitUnaryExpression(context: EmitContext, sourceFile: ast.SourceFile, expression: ast.UnaryExpression) {
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
      emitUnexpectedNode(context, nameof(emitUnaryExpression), sourceFile, expression);
      break;
  }

  emitExpression(context, sourceFile, expression.expression);
}
