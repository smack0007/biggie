import {
  CallExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  IntegerLiteral,
  ReturnStatement,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  SyntaxNode,
} from "../frontend/ast";
import { BackendContext } from "./backend";

export function outputC(sourceFile: SourceFile, context: BackendContext): void {
  outputPreamble(context);

  for (const statement of sourceFile.statements) {
    outputTopLevelStatement(context, sourceFile, statement);
  }
}

function outputPreamble(context: BackendContext): void {
  context.output("#include <stdint.h>\n");
  context.output("typedef int32_t i32;\n");
  context.output("\n");
  context.output("int printf(const char *format, ...);\n");
  context.output("\n");
}

function outputUnexpectedNode(
  context: BackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode
): void {
  context.output(`/* Unexpected node in ${functionName}:\n`);
  // const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  // context.output(`${sourceFile.fileName} (${line + 1},${character + 1}) ${SyntaxKind[node.kind]} ${message}`);
  context.output(`${sourceFile.fileName} ${SyntaxKind[node.kind]}`);
  context.output("*/\n");
}

function outputTopLevelStatement(context: BackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.FunctionDeclaration:
      outputFunctionDeclaration(context, sourceFile, <FunctionDeclaration>node);
      break;

    default:
      outputUnexpectedNode(context, outputTopLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputFunctionDeclaration(
  context: BackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration
): void {
  const returnType: string = functionDeclaration.returnType.name.value;
  const name: string = functionDeclaration.name.value;

  context.output(`${returnType} ${name}() {\n`);

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      outputBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.output(`}\n`);
}

function outputBlockLevelStatement(context: BackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  switch (node.kind) {
    case SyntaxKind.ExpressionStatement:
      outputExpressionStatement(context, sourceFile, <ExpressionStatement>node);
      break;

    case SyntaxKind.ReturnStatement:
      outputReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    default:
      outputUnexpectedNode(context, outputBlockLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputExpressionStatement(
  context: BackendContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement
) {
  outputExpression(context, sourceFile, expressionStatement.expression);
  context.output(";\n");
}

function outputReturnStatement(context: BackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.output("return ");

  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }

  context.output(";\n");
}

function outputExpression(context: BackendContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    case SyntaxKind.CallExpression:
      outputCallExpression(context, sourceFile, <CallExpression>expression);
      break;

    case SyntaxKind.Identifier:
      outputIdentifier(context, sourceFile, <Identifier>expression);
      break;

    case SyntaxKind.IntegerLiteral:
      outputIntegerLiteral(context, sourceFile, <IntegerLiteral>expression);
      break;

    case SyntaxKind.StringLiteral:
      outputStringLiteral(context, sourceFile, <StringLiteral>expression);
      break;

    default:
      outputUnexpectedNode(context, outputExpression.name, sourceFile, expression);
      break;
  }
}

function outputCallExpression(context: BackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
  outputExpression(context, sourceFile, callExpression.expression);
  context.output("(");

  for (let i = 0; i < callExpression.arguments.length; i++) {
    if (i != 0) {
      context.output(", ");
    }

    outputExpression(context, sourceFile, callExpression.arguments[i]);
  }

  context.output(")");
}

function outputIdentifier(context: BackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.output(identifier.value);
}

function outputIntegerLiteral(context: BackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.output(integerLiteral.value);
}

function outputStringLiteral(context: BackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.output('"');
  context.output(stringLiteral.value);
  context.output('"');
}
