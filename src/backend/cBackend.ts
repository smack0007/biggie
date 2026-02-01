import {
  AdditiveExpression,
  AssignmentExpression,
  ArrayLiteral,
  ArrayType,
  BooleanLiteral,
  CallExpression,
  ComparisonExpression,
  DeferStatement,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  IntegerLiteral,
  LogicalExpression,
  MultiplicativeExpression,
  Operator,
  ParenthesizedExpression,
  ReturnStatement,
  SourceFile,
  StatementBlock,
  StringLiteral,
  SyntaxKind,
  SyntaxNode,
  TypeNode,
  TypeReference,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
  ElementAccessExpression,
  PropertyAccessExpression,
  StructDeclaration,
  StructLiteral,
  PointerType,
} from "../frontend/ast.ts";
import { int, nameof } from "../shims.ts";
import { BackendContext } from "./backend.ts";

interface CBackendContext extends BackendContext {}

export function emitC(sourceFile: SourceFile, baseContext: BackendContext): void {
  const context: CBackendContext = {
    ...baseContext,
  };

  emitPreamble(context);

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, sourceFile, statement);
  }
}

function emitPreamble(context: CBackendContext): void {
  context.append("#include <biggie.c>\n");
  context.append("\n");
}

function emitUnexpectedNode(
  context: CBackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode,
): void {
  context.append(`/* Unexpected node in ${functionName}:\n`);
  context.append(`${sourceFile.fileName} ${SyntaxKind[node.kind]}`);
  context.append("*/\n");
}

function emitTopLevelStatement(context: CBackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.FuncDeclaration:
      emitFunctionDeclaration(context, sourceFile, <FunctionDeclaration>node);
      break;

    case SyntaxKind.StructDeclaration:
      emitStructDeclaration(context, sourceFile, <StructDeclaration>node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitTopLevelStatement), sourceFile, node);
      break;
  }
}

function emitFunctionDeclaration(
  context: CBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration,
): void {
  const returnType: string = functionDeclaration.returnType.name.value;
  const name: string = functionDeclaration.name.value;

  context.append(`${returnType} ${name}(`);

  for (let i = 0; i < functionDeclaration.arguments.length; i++) {
    const arg = functionDeclaration.arguments[i];
    const argType = arg.type.value;
    const argName = arg.name.value;

    if (i != 0) {
      context.append(", ");
    }

    context.append(`${argType} ${argName}`);
  }

  context.append(") ");

  emitStatementBlock(context, sourceFile, functionDeclaration.body);

  context.append("\n\n");
}

function emitStructDeclaration(
  context: CBackendContext,
  sourceFile: SourceFile,
  structDeclaration: StructDeclaration,
): void {
  const name: string = structDeclaration.name.value;

  context.append(`typedef struct ${name} {\n`);

  context.indentLevel += 1;
  for (let i = 0; i < structDeclaration.members.length; i++) {
    const member = structDeclaration.members[i];
    const memberType = member.type.value;
    const memberName = member.name.value;
    context.append(`${memberType} ${memberName};\n`);
  }
  context.indentLevel -= 1;

  context.append(`} ${name};\n\n`);
}

function emitStatementBlock(context: CBackendContext, sourceFile: SourceFile, statementBlock: StatementBlock) {
  context.append("{\n");
  context.indentLevel += 1;

  for (const statement of statementBlock.statements) {
    emitBlockLevelStatement(context, sourceFile, statement);
  }

  context.indentLevel -= 1;
  context.append("}");
}

function emitBlockLevelStatement(context: CBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  switch (node.kind) {
    case SyntaxKind.DeferStatement:
      emitDeferStatement(context, sourceFile, <DeferStatement>node);
      break;

    case SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, sourceFile, <ExpressionStatement>node);
      break;

    case SyntaxKind.IfStatement:
      emitIfStatement(context, sourceFile, <IfStatement>node);
      break;

    case SyntaxKind.ReturnStatement:
      emitReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    case SyntaxKind.StatementBlock:
      emitStatementBlock(context, sourceFile, <StatementBlock>node);
      break;

    case SyntaxKind.VariableDeclaration:
      emitVarDeclaration(context, sourceFile, <VariableDeclaration>node);
      break;

    case SyntaxKind.WhileStatement:
      emitWhileStatement(context, sourceFile, <WhileStatement>node);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitBlockLevelStatement), sourceFile, node);
      break;
  }
}

function emitDeferStatement(context: CBackendContext, sourceFile: SourceFile, deferStatement: DeferStatement) {
  context.append("defer ");

  if (deferStatement.body.kind !== SyntaxKind.StatementBlock) {
    context.append("{ ");
  }

  emitBlockLevelStatement(context, sourceFile, deferStatement.body);

  if (deferStatement.body.kind !== SyntaxKind.StatementBlock) {
    context.remove(1);
    context.append(" }");
  }

  context.append(";\n");
}

function emitExpressionStatement(
  context: CBackendContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement,
) {
  emitExpression(context, sourceFile, expressionStatement.expression);
  context.append(";\n");
}

function emitIfStatement(context: CBackendContext, sourceFile: SourceFile, ifStatement: IfStatement) {
  context.append("if (");
  emitExpression(context, sourceFile, ifStatement.condition);
  context.append(") ");
  emitBlockLevelStatement(context, sourceFile, ifStatement.then);

  if (ifStatement.else != null) {
    context.append(" else ");
    emitBlockLevelStatement(context, sourceFile, ifStatement.else);
  }

  context.append("\n");
}

function emitReturnStatement(context: CBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.append("return ");

  if (returnStatement.expression != null) {
    emitExpression(context, sourceFile, returnStatement.expression);
  }

  context.append(";\n");
}

function emitVarDeclaration(
  context: CBackendContext,
  sourceFile: SourceFile,
  variableDeclaration: VariableDeclaration,
) {
  const emitTypeResult = emitType(context, sourceFile, variableDeclaration.type);
  context.append(" ");
  emitIdentifier(context, sourceFile, variableDeclaration.name);

  for (let i = 0; i < emitTypeResult.arrayDepth; i++) {
    context.append("[]");
  }

  if (variableDeclaration.expression != null) {
    context.append(" = ");
    emitExpression(context, sourceFile, variableDeclaration.expression);
  }

  context.append(";\n");
}

function emitWhileStatement(context: CBackendContext, sourceFile: SourceFile, whileStatement: WhileStatement) {
  context.append("while (");
  emitExpression(context, sourceFile, whileStatement.condition);
  context.append(") ");
  emitBlockLevelStatement(context, sourceFile, whileStatement.body);
  context.append("\n");
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
  context: CBackendContext,
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
  context: CBackendContext,
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
  context: CBackendContext,
  sourceFile: SourceFile,
  pointerType: PointerType,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  emitType(context, sourceFile, pointerType.elementType, result);
  context.append("*");

  return result;
}

function emitTypeReference(
  context: CBackendContext,
  sourceFile: SourceFile,
  typeReference: TypeReference,
  result: EmitTypeResult | undefined = undefined,
): EmitTypeResult {
  if (result == undefined) {
    result = newEmitTypeResult();
  }

  emitIdentifier(context, sourceFile, typeReference.name);

  return result;
}

function emitExpression(context: CBackendContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    case SyntaxKind.AdditiveExpression:
      emitAdditiveExpression(context, sourceFile, <AdditiveExpression>expression);
      break;

    case SyntaxKind.ArrayLiteral:
      emitArrayLiteral(context, sourceFile, <ArrayLiteral>expression);
      break;

    case SyntaxKind.AssignmentExpression:
      emitAssignmentExpression(context, sourceFile, <AssignmentExpression>expression);
      break;

    case SyntaxKind.BooleanLiteral:
      emitBooleanLiteral(context, sourceFile, <BooleanLiteral>expression);
      break;

    case SyntaxKind.CallExpression:
      emitCallExpression(context, sourceFile, <CallExpression>expression);
      break;

    case SyntaxKind.ComparisonExpression:
      emitComparisonExpression(context, sourceFile, <ComparisonExpression>expression);
      break;

    case SyntaxKind.ElementAccessExpression:
      emitElementAccessExpression(context, sourceFile, <ElementAccessExpression>expression);
      break;

    case SyntaxKind.EqualityExpression:
      emitEqualityExpression(context, sourceFile, <EqualityExpression>expression);
      break;

    case SyntaxKind.Identifier:
      emitIdentifier(context, sourceFile, <Identifier>expression);
      break;

    case SyntaxKind.IntegerLiteral:
      emitIntegerLiteral(context, sourceFile, <IntegerLiteral>expression);
      break;

    case SyntaxKind.LogicalExpression:
      emitLogicalExpression(context, sourceFile, <LogicalExpression>expression);
      break;

    case SyntaxKind.MultiplicativeExpression:
      emitMultiplicativeExpression(context, sourceFile, <MultiplicativeExpression>expression);
      break;

    case SyntaxKind.ParenthesizedExpression:
      emitParenthesizedExpression(context, sourceFile, <ParenthesizedExpression>expression);
      break;

    case SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(context, sourceFile, <PropertyAccessExpression>expression);
      break;

    case SyntaxKind.StringLiteral:
      emitStringLiteral(context, sourceFile, <StringLiteral>expression);
      break;

    case SyntaxKind.StructLiteral:
      emitStructLiteral(context, sourceFile, <StructLiteral>expression);
      break;

    case SyntaxKind.UnaryExpression:
      emitUnaryExpression(context, sourceFile, <UnaryExpression>expression);
      break;

    default:
      emitUnexpectedNode(context, nameof(emitExpression), sourceFile, expression);
      break;
  }
}

function emitAssignmentExpression(
  context: CBackendContext,
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

  context.append(` ${operator} `);

  emitExpression(context, sourceFile, expression.value);
}

function emitAdditiveExpression(
  context: CBackendContext,
  sourceFile: SourceFile,
  expression: AdditiveExpression,
): void {
  emitExpression(context, sourceFile, expression.lhs);

  context.append(` ${expression.operator == Operator.Plus ? "+" : "-"} `);

  emitExpression(context, sourceFile, expression.rhs);
}

function emitArrayLiteral(context: CBackendContext, sourceFile: SourceFile, arrayLiteral: ArrayLiteral) {
  context.append("{");

  for (let i = 0; i < arrayLiteral.elements.length; i += 1) {
    if (i != 0) {
      context.append(", ");
    }

    emitExpression(context, sourceFile, arrayLiteral.elements[i]);
  }

  context.append("}");
}

function emitBooleanLiteral(context: CBackendContext, sourceFile: SourceFile, booleanLiteral: BooleanLiteral) {
  context.append(booleanLiteral.value ? "true" : "false");
}

function emitCallExpression(context: CBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
  emitExpression(context, sourceFile, callExpression.expression);
  context.append("(");

  for (let i = 0; i < callExpression.arguments.length; i++) {
    if (i != 0) {
      context.append(", ");
    }

    emitExpression(context, sourceFile, callExpression.arguments[i]);
  }

  context.append(")");
}

function emitElementAccessExpression(
  context: CBackendContext,
  sourceFile: SourceFile,
  elementAccessExpression: ElementAccessExpression,
) {
  emitExpression(context, sourceFile, elementAccessExpression.expression);
  context.append("[");
  emitExpression(context, sourceFile, elementAccessExpression.argumentExpression);
  context.append("]");
}

function emitPropertyAccessExpression(
  context: CBackendContext,
  sourceFile: SourceFile,
  propertyAccessExpression: PropertyAccessExpression,
) {
  emitExpression(context, sourceFile, propertyAccessExpression.expression);
  context.append(".");
  emitIdentifier(context, sourceFile, propertyAccessExpression.name);

  // HACK: For now emit parenthesis if length.
  if (propertyAccessExpression.name.value == "length") {
    context.append("()");
  }
}

function emitComparisonExpression(context: CBackendContext, sourceFile: SourceFile, expression: ComparisonExpression) {
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

  context.append(` ${operator} `);

  emitExpression(context, sourceFile, expression.rhs);
}

function emitEqualityExpression(context: CBackendContext, sourceFile: SourceFile, expression: EqualityExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.EqualsEquals ? " == " : " != ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitIdentifier(context: CBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function emitIntegerLiteral(context: CBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.append(integerLiteral.value);
}

function emitLogicalExpression(context: CBackendContext, sourceFile: SourceFile, expression: LogicalExpression) {
  emitExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.AmpersandAmpersand ? " && " : " || ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitMultiplicativeExpression(
  context: CBackendContext,
  sourceFile: SourceFile,
  expression: MultiplicativeExpression,
) {
  emitExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.Asterisk ? " * " : " / ");

  emitExpression(context, sourceFile, expression.rhs);
}

function emitParenthesizedExpression(
  context: CBackendContext,
  sourceFile: SourceFile,
  expression: ParenthesizedExpression,
) {
  context.append("(");
  emitExpression(context, sourceFile, expression.expression);
  context.append(")");
}

function emitStringLiteral(context: CBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.append(`"${stringLiteral.value}"`);
}

function emitStructLiteral(context: CBackendContext, sourceFile: SourceFile, structLiteral: StructLiteral) {
  context.append("{\n");
  context.indentLevel += 1;

  for (const element of structLiteral.elements) {
    if (element.name) {
      context.append(`.${element.name.value} = `);
    }

    emitExpression(context, sourceFile, element.expression);

    context.append(",\n");
  }

  context.indentLevel -= 1;
  context.append("}");
}

function emitUnaryExpression(context: CBackendContext, sourceFile: SourceFile, expression: UnaryExpression) {
  switch (expression.operator) {
    case Operator.Ampersand:
      context.append("&");
      break;
    case Operator.Asterisk:
      context.append("*");
      break;
    case Operator.Exclamation:
      context.append("!");
      break;
    case Operator.Minus:
      context.append("-");
      break;
    default:
      emitUnexpectedNode(context, nameof(emitUnaryExpression), sourceFile, expression);
      break;
  }

  emitExpression(context, sourceFile, expression.expression);
}
