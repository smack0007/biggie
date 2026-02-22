import { basename, extname } from "node:path";
import {
  AdditiveExpression,
  ArrayLiteral,
  ArrayType,
  AssignmentExpression,
  BooleanLiteral,
  CallExpression,
  ComparisonExpression,
  DeferStatement,
  ElementAccessExpression,
  EnumDeclaration,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  ImportDeclaration,
  IntegerLiteral,
  LogicalExpression,
  MultiplicativeExpression,
  Operator,
  ParenthesizedExpression,
  PointerType,
  PropertyAccessExpression,
  ReturnStatement,
  SourceFile,
  StatementBlock,
  StringLiteral,
  StructDeclaration,
  StructLiteral,
  SyntaxKind,
  SyntaxNode,
  TypeNode,
  TypeReference,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from "../frontend/ast.ts";
import * as astUtils from "../frontend/astUtils.ts";
import { int, nameof } from "../shims.ts";
import { OutputWriter } from "../outputWriter.ts";
import { Program } from "../frontend/program.ts";
import { SymbolFlags } from "../frontend/symbols.ts";
import { inspect } from "node:util";

interface EmitContext {
  output: OutputWriter;
  outputStack: OutputWriter[];

  // [SourceFile.fileName] = SourceFile
  sourceFiles: Record<string, SourceFile>;
  // Set<fileName>
  emittedSourceFiles: Set<string>;
  // A stack of prefixes to attach to names.
  namePrefixStack: string[];
  // [moduleAlias] = SourceFile
  importMap: Record<string, SourceFile>[];
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

export function emitC(program: Program): EmitResult {
  const context: EmitContext = {
    output: new OutputWriter(),
    outputStack: [],
    sourceFiles: program.sourceFiles,
    emittedSourceFiles: new Set<string>(),
    namePrefixStack: [],
    importMap: [{}],
    moduleTypeNameMap: {},
    tmpVariableIndex: 0,
    blockLevelStatementPlaceholderStack: [],
  };

  emitPreamble(context);

  const entrySourceFile = program.sourceFiles[program.entryFileName];

  emitSourceFile(context, entrySourceFile);

  context.output.appendLine(`/* ${inspect(context.moduleTypeNameMap)} */`);

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

  return "_" + context.namePrefixStack.join("_") + "_";
}

function pushImportMap(context: EmitContext): void {
  context.importMap.push({});
}

function popImportMap(context: EmitContext): void {
  context.importMap.pop();
}

function getImportedModuleByAlias(context: EmitContext, moduleAlias: string): SourceFile | null {
  return context.importMap[context.importMap.length - 1][moduleAlias] ?? null;
}

function setImportedModule(context: EmitContext, moduleAlias: string, sourceFile: SourceFile): void {
  context.importMap[context.importMap.length - 1][moduleAlias] = sourceFile;
}

function mapModuleTypeName(
  context: EmitContext,
  sourceFile: SourceFile,
  typeName: string,
  mappedTypeName: string,
): void {
  if (!context.moduleTypeNameMap[sourceFile.fileName]) {
    context.moduleTypeNameMap[sourceFile.fileName] = {};
  }

  context.moduleTypeNameMap[sourceFile.fileName][typeName] = mappedTypeName;
}

function getMappedModuleTypeName(context: EmitContext, sourceFile: SourceFile, typeName: string): string | null {
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

function emitPreamble(context: EmitContext): void {
  context.output.appendLine("#include <biggie.c>");
  context.output.appendLine();
}

function emitUnexpectedNode(
  context: EmitContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode,
): void {
  context.output.appendLine("/*");
  context.output.appendLine(`Unexpected node in ${functionName}:`);
  context.output.append(`${sourceFile.fileName} ${SyntaxKind[node.kind]}`);
  context.output.appendLine("*/");
}

function emitSourceFile(context: EmitContext, sourceFile: SourceFile): void {
  pushImportMap(context);

  // Emit import statements first.
  for (const statement of sourceFile.statements.filter((s) => s.kind == SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, sourceFile, statement);
  }

  context.output.appendLine(`/* SourceFile: ${sourceFile.fileName} */`);
  context.output.appendLine();

  for (const statement of sourceFile.statements.filter((s) => s.kind != SyntaxKind.ImportDeclaration)) {
    emitTopLevelStatement(context, sourceFile, statement);
  }

  popImportMap(context);
  context.emittedSourceFiles.add(sourceFile.fileName);
}

function emitTopLevelStatement(context: EmitContext, sourceFile: SourceFile, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.ImportDeclaration:
      emitImportDeclaration(context, sourceFile, <ImportDeclaration> node);
      break;

    case SyntaxKind.EnumDeclaration:
      emitEnumDeclaration(context, sourceFile, <EnumDeclaration> node);
      break;

    case SyntaxKind.FunctionDeclaration:
      emitFunctionDeclaration(context, sourceFile, <FunctionDeclaration> node);
      break;

    case SyntaxKind.StructDeclaration:
      emitStructDeclaration(context, sourceFile, <StructDeclaration> node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitTopLevelStatement), sourceFile, node);
      break;
  }
}

function emitImportDeclaration(
  context: EmitContext,
  sourceFile: SourceFile,
  importDeclaration: ImportDeclaration,
): void {
  const resolvedSourceFile = context.sourceFiles[importDeclaration.resolvedFileName];

  if (!resolvedSourceFile) {
    throw new Error("resolvedSourceFile is null");
  }

  const moduleAlias = astUtils.getOrCalculateModuleAlias(importDeclaration);

  if (!context.emittedSourceFiles.has(resolvedSourceFile.fileName)) {
    pushNamePrefix(context, moduleAlias);
    emitSourceFile(context, resolvedSourceFile);
    popNamePrefix(context);
  }

  setImportedModule(context, moduleAlias, resolvedSourceFile);
}

function emitEnumDeclaration(context: EmitContext, sourceFile: SourceFile, enumDeclaration: EnumDeclaration): void {
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

function emitFunctionDeclaration(
  context: EmitContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration,
): void {
  emitType(context, sourceFile, functionDeclaration.returnType);

  const mappedFunctionName = getNamePrefix(context) + functionDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, functionDeclaration.name.value, mappedFunctionName);

  context.output.append(` ${mappedFunctionName}(`);

  for (let i = 0; i < functionDeclaration.arguments.length; i++) {
    const arg = functionDeclaration.arguments[i];

    if (i != 0) {
      context.output.append(", ");
    }

    emitType(context, sourceFile, arg.type);
    context.output.append(` ${arg.name.value}`);
  }

  context.output.append(") ");

  emitStatementBlock(context, sourceFile, functionDeclaration.body);

  context.output.appendLine();
}

function emitStructDeclaration(
  context: EmitContext,
  sourceFile: SourceFile,
  structDeclaration: StructDeclaration,
): void {
  const mappedStructName = getNamePrefix(context) + structDeclaration.name.value;
  mapModuleTypeName(context, sourceFile, structDeclaration.name.value, mappedStructName);

  context.output.appendLine(`typedef struct ${mappedStructName} {`);

  context.output.indent();
  for (let i = 0; i < structDeclaration.members.length; i++) {
    const member = structDeclaration.members[i];
    const memberType = member.type.value;
    const memberName = member.name.value;
    context.output.appendLine(`${memberType} ${memberName};`);
  }
  context.output.unindent();

  context.output.appendLine(`} ${mappedStructName};`);
  context.output.appendLine();
}

function emitStatementBlock(context: EmitContext, sourceFile: SourceFile, statementBlock: StatementBlock) {
  context.output.appendLine("{");
  context.output.indent();

  for (const statement of statementBlock.statements) {
    emitBlockLevelStatement(context, sourceFile, statement);
  }

  context.output.unindent();
  context.output.appendLine("}");
}

function emitBlockLevelStatement(context: EmitContext, sourceFile: SourceFile, node: SyntaxNode) {
  const placeholder = pushBlockLevelStatementPlaceholder(context);
  const statementOutput = pushOutput(context);

  switch (node.kind) {
    case SyntaxKind.DeferStatement:
      emitDeferStatement(context, sourceFile, <DeferStatement> node);
      break;

    case SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, sourceFile, <ExpressionStatement> node);
      break;

    case SyntaxKind.IfStatement:
      emitIfStatement(context, sourceFile, <IfStatement> node);
      break;

    case SyntaxKind.ReturnStatement:
      emitReturnStatement(context, sourceFile, <ReturnStatement> node);
      break;

    case SyntaxKind.StatementBlock:
      emitStatementBlock(context, sourceFile, <StatementBlock> node);
      break;

    case SyntaxKind.VariableDeclaration:
      emitVariableDeclaration(context, sourceFile, <VariableDeclaration> node);
      break;

    case SyntaxKind.WhileStatement:
      emitWhileStatement(context, sourceFile, <WhileStatement> node);
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

function emitDeferStatement(context: EmitContext, sourceFile: SourceFile, deferStatement: DeferStatement) {
  context.output.append("defer ");

  if (deferStatement.body.kind !== SyntaxKind.StatementBlock) {
    context.output.append("{ ");
  }

  emitBlockLevelStatement(context, sourceFile, deferStatement.body);

  if (deferStatement.body.kind !== SyntaxKind.StatementBlock) {
    //context.remove(1);
    context.output.append(" }");
  }

  context.output.appendLine(";");
}

function emitExpressionStatement(
  context: EmitContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement,
) {
  emitExpression(context, sourceFile, expressionStatement.expression);
  context.output.appendLine(";");
}

function emitIfStatement(context: EmitContext, sourceFile: SourceFile, ifStatement: IfStatement) {
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

function emitReturnStatement(context: EmitContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.output.append("return ");

  if (returnStatement.expression != null) {
    emitExpression(context, sourceFile, returnStatement.expression);
  }

  context.output.appendLine(";");
}

function emitVariableDeclaration(
  context: EmitContext,
  sourceFile: SourceFile,
  variableDeclaration: VariableDeclaration,
) {
  const emitTypeResult = emitType(context, sourceFile, variableDeclaration.type);
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

function emitWhileStatement(context: EmitContext, sourceFile: SourceFile, whileStatement: WhileStatement) {
  context.output.append("while (");
  emitExpression(context, sourceFile, whileStatement.condition);
  context.output.append(") ");
  emitBlockLevelStatement(context, sourceFile, whileStatement.body);
}

interface EmitTypeResult {
  arrayDepth: int;
}

function newEmitTypeResult(): EmitTypeResult {
  return {
    arrayDepth: 0,
  };
}

function emitType(
  context: EmitContext,
  sourceFile: SourceFile,
  type: TypeNode,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  switch (type.kind) {
    case SyntaxKind.ArrayType:
      emitArrayType(context, sourceFile, type as ArrayType, result);
      break;

    case SyntaxKind.PointerType:
      emitPointerType(context, sourceFile, type as PointerType, result);
      break;

    case SyntaxKind.TypeReference:
      emitTypeReference(context, sourceFile, type as TypeReference, result);
      break;
  }

  return result;
}

function emitArrayType(
  context: EmitContext,
  sourceFile: SourceFile,
  arrayType: ArrayType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  result.arrayDepth += 1;
  emitType(context, sourceFile, arrayType.elementType, result);

  return result;
}

function emitPointerType(
  context: EmitContext,
  sourceFile: SourceFile,
  pointerType: PointerType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  emitType(context, sourceFile, pointerType.elementType, result);
  context.output.append("*");

  return result;
}

function emitTypeReference(
  context: EmitContext,
  sourceFile: SourceFile,
  typeReference: TypeReference,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  if (typeReference.typeName.kind == SyntaxKind.QualifiedName) {
    const module = getImportedModuleByAlias(context, typeReference.typeName.left.value);

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
    const mappedTypeName = getMappedModuleTypeName(context, sourceFile, typeReference.typeName.value);

    if (mappedTypeName != null) {
      context.output.append(mappedTypeName);
    } else {
      emitIdentifier(context, sourceFile, typeReference.typeName);
    }
  }

  return result;
}

function emitExpression(context: EmitContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    case SyntaxKind.AdditiveExpression:
      emitAdditiveExpression(context, sourceFile, <AdditiveExpression> expression);
      break;

    case SyntaxKind.ArrayLiteral:
      emitArrayLiteral(context, sourceFile, <ArrayLiteral> expression);
      break;

    case SyntaxKind.AssignmentExpression:
      emitAssignmentExpression(context, sourceFile, <AssignmentExpression> expression);
      break;

    case SyntaxKind.BooleanLiteral:
      emitBooleanLiteral(context, sourceFile, <BooleanLiteral> expression);
      break;

    case SyntaxKind.CallExpression:
      emitCallExpression(context, sourceFile, <CallExpression> expression);
      break;

    case SyntaxKind.ComparisonExpression:
      emitComparisonExpression(context, sourceFile, <ComparisonExpression> expression);
      break;

    case SyntaxKind.ElementAccessExpression:
      emitElementAccessExpression(context, sourceFile, <ElementAccessExpression> expression);
      break;

    case SyntaxKind.EqualityExpression:
      emitEqualityExpression(context, sourceFile, <EqualityExpression> expression);
      break;

    case SyntaxKind.Identifier:
      emitIdentifier(context, sourceFile, <Identifier> expression);
      break;

    case SyntaxKind.IntegerLiteral:
      emitIntegerLiteral(context, sourceFile, <IntegerLiteral> expression);
      break;

    case SyntaxKind.LogicalExpression:
      emitLogicalExpression(context, sourceFile, <LogicalExpression> expression);
      break;

    case SyntaxKind.MultiplicativeExpression:
      emitMultiplicativeExpression(context, sourceFile, <MultiplicativeExpression> expression);
      break;

    case SyntaxKind.ParenthesizedExpression:
      emitParenthesizedExpression(context, sourceFile, <ParenthesizedExpression> expression);
      break;

    case SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(context, sourceFile, <PropertyAccessExpression> expression);
      break;

    case SyntaxKind.StringLiteral:
      emitStringLiteral(context, sourceFile, <StringLiteral> expression);
      break;

    case SyntaxKind.StructLiteral:
      emitStructLiteral(context, sourceFile, <StructLiteral> expression);
      break;

    case SyntaxKind.UnaryExpression:
      emitUnaryExpression(context, sourceFile, <UnaryExpression> expression);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitExpression), sourceFile, expression);
      break;
  }
}

function emitAssignmentExpression(
  context: EmitContext,
  sourceFile: SourceFile,
  expression: AssignmentExpression,
): void {
  emitIdentifier(context, sourceFile, expression.name);

  let operator = "=";
  switch (expression.operator) {
    case Operator.PlusEquals:
      operator = "+=";
      break;

    case Operator.MinusEquals:
      operator = "-=";
      break;

    case Operator.AsteriskEquals:
      operator = "*=";
      break;

    case Operator.SlashEquals:
      operator = "/=";
      break;
  }

  context.output.append(` ${operator} `);

  emitExpression(context, sourceFile, expression.value);
}

function emitAdditiveExpression(context: EmitContext, sourceFile: SourceFile, expression: AdditiveExpression): void {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(` ${expression.operator == Operator.Plus ? "+" : "-"} `);

  emitExpression(context, sourceFile, expression.rhs);
}

function emitArrayLiteral(context: EmitContext, sourceFile: SourceFile, arrayLiteral: ArrayLiteral) {
  context.output.append("{");

  for (let i = 0; i < arrayLiteral.elements.length; i += 1) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, sourceFile, arrayLiteral.elements[i]);
  }

  context.output.append("}");
}

function emitBooleanLiteral(context: EmitContext, sourceFile: SourceFile, booleanLiteral: BooleanLiteral) {
  context.output.append(booleanLiteral.value ? "true" : "false");
}

function emitCallExpression(context: EmitContext, sourceFile: SourceFile, callExpression: CallExpression) {
  // HACK: For now just check for the "println" function to treat it as a varadic function.
  let isVaradicCall = false;
  let beginVaradicArgs = callExpression.arguments.length;
  let varadicArgsArrayName = "";
  if (callExpression.expression.kind == SyntaxKind.Identifier) {
    const functionName = (<Identifier> callExpression.expression).value;

    if (functionName == "println") {
      isVaradicCall = true;
      beginVaradicArgs = 1;
    }
  }

  if (isVaradicCall) {
    const placeholder = getBlockLevelStatementPlaceholder(context);
    pushOutput(context, placeholder);

    const varadicVariableNames: string[] = [];
    for (let i = beginVaradicArgs; i < callExpression.arguments.length; i += 1) {
      const varadicVariableName = `__v${context.tmpVariableIndex++}`;
      varadicVariableNames.push(varadicVariableName);
      // TODO: Would be nice if we didn't have to use 'auto' here.
      context.output.append(`auto ${varadicVariableName} = `);
      emitExpression(context, sourceFile, callExpression.arguments[i]);
      context.output.appendLine(";");
    }

    varadicArgsArrayName = `__vargs${context.tmpVariableIndex++}`;
    context.output.append(`void* ${varadicArgsArrayName}[] = {`);
    context.output.append(varadicVariableNames.map((x) => `&${x}`).join(", "));
    context.output.appendLine("};");

    popOutput(context);
  }

  emitExpression(context, sourceFile, callExpression.expression);
  context.output.append("(");

  for (let i = 0; i < beginVaradicArgs; i++) {
    if (i != 0) {
      context.output.append(", ");
    }

    emitExpression(context, sourceFile, callExpression.arguments[i]);
  }

  if (isVaradicCall) {
    if (beginVaradicArgs != 0) {
      context.output.append(", ");
    }
    context.output.append(varadicArgsArrayName);
  }

  context.output.append(")");
}

function emitElementAccessExpression(
  context: EmitContext,
  sourceFile: SourceFile,
  elementAccessExpression: ElementAccessExpression,
) {
  emitExpression(context, sourceFile, elementAccessExpression.expression);
  context.output.append("[");
  emitExpression(context, sourceFile, elementAccessExpression.argumentExpression);
  context.output.append("]");
}

function emitPropertyAccessExpression(
  context: EmitContext,
  sourceFile: SourceFile,
  propertyAccessExpression: PropertyAccessExpression,
) {
  if (propertyAccessExpression.expression.symbol) {
    // TODO: Implement HasFlag method.
    if (propertyAccessExpression.expression.symbol.flags == SymbolFlags.Module) {
      const module = getImportedModuleByAlias(context, propertyAccessExpression.expression.symbol.name);

      if (module != null) {
        const mappedTypeName = getMappedModuleTypeName(context, module, propertyAccessExpression.name.value);

        if (mappedTypeName != null) {
          context.output.append(mappedTypeName);
          return;
        }
      }
    } else if (propertyAccessExpression.expression.symbol.flags == SymbolFlags.Enum) {
      const module = context.sourceFiles[propertyAccessExpression.expression.symbol.sourceFileName];
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
    emitExpression(context, sourceFile, propertyAccessExpression.expression);
    context.output.append(".");
  }

  emitIdentifier(context, sourceFile, propertyAccessExpression.name);
}

function emitComparisonExpression(context: EmitContext, sourceFile: SourceFile, expression: ComparisonExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  let operator = ">";

  switch (expression.operator) {
    case Operator.GreaterThan:
      operator = ">";
      break;

    case Operator.GreaterThanEquals:
      operator = ">=";
      break;

    case Operator.LessThan:
      operator = "<";
      break;

    case Operator.LessThanEquals:
      operator = "<=";
      break;
  }

  context.output.append(` ${operator} `);

  emitExpression(context, sourceFile, expression.rhs);
}

function emitEqualityExpression(context: EmitContext, sourceFile: SourceFile, expression: EqualityExpression) {
  emitExpression(context, sourceFile, expression.lhs);
  context.output.append(expression.operator == Operator.EqualsEquals ? " == " : " != ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitIdentifier(context: EmitContext, sourceFile: SourceFile, identifier: Identifier) {
  context.output.append(identifier.value);
}

function emitIntegerLiteral(context: EmitContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.output.append(integerLiteral.value);
}

function emitLogicalExpression(context: EmitContext, sourceFile: SourceFile, expression: LogicalExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(expression.operator == Operator.AmpersandAmpersand ? " && " : " || ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitMultiplicativeExpression(
  context: EmitContext,
  sourceFile: SourceFile,
  expression: MultiplicativeExpression,
) {
  emitExpression(context, sourceFile, expression.lhs);

  context.output.append(expression.operator == Operator.Asterisk ? " * " : " / ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitParenthesizedExpression(
  context: EmitContext,
  sourceFile: SourceFile,
  expression: ParenthesizedExpression,
) {
  context.output.append("(");
  emitExpression(context, sourceFile, expression.expression);
  context.output.append(")");
}

function emitStringLiteral(context: EmitContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.output.append(`STR("${stringLiteral.value}")`);
}

function emitStructLiteral(context: EmitContext, sourceFile: SourceFile, structLiteral: StructLiteral) {
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

function emitUnaryExpression(context: EmitContext, sourceFile: SourceFile, expression: UnaryExpression) {
  switch (expression.operator) {
    case Operator.Ampersand:
      context.output.append("&");
      break;
    case Operator.Asterisk:
      context.output.append("*");
      break;
    case Operator.Exclamation:
      context.output.append("!");
      break;
    case Operator.Minus:
      context.output.append("-");
      break;
    default:
      emitUnexpectedNode(context, nameof(emitUnaryExpression), sourceFile, expression);
      break;
  }

  emitExpression(context, sourceFile, expression.expression);
}
