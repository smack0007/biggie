import {
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  ReturnStatement,
  SourceFile,
  SyntaxKind,
  SyntaxNode,
} from "./ast";
import { BackendContext } from "./backend";

export function outputCLanguage(sourceFile: SourceFile, context: BackendContext): void {
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
      outputExpression(context, sourceFile, (<ExpressionStatement>node).expression);
      break;

    case SyntaxKind.ReturnStatement:
      outputReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    default:
      outputUnexpectedNode(context, outputBlockLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputReturnStatement(context: BackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.output("return ");

  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }

  context.output(";\n");
}

function outputExpression(context: BackendContext, sourceFile: SourceFile, expression: Expression) {
  // switch (expression.kind) {
  //   case SyntaxKind.CallExpression:
  //     parseCallExpression(sourceFile, expression as ts.CallExpression);
  //     break;

  //   case SyntaxKind.NumericLiteral:
  //     parseNumericLiteral(sourceFile, expression as ts.NumericLiteral);
  //     break;

  //   default:
  //     outputUnexpectedNode(parseExpression.name, sourceFile, expression);
  //     break;
  // }

  context.output(expression.value);
}

// function parseCallExpression(context: BackendContext, sourceFile: SourceFile, callExpression: ts.CallExpression) {
//   context.output(callExpression.getText());
// }

// function parseNumericLiteral(context: BackendContext, sourceFile: SourceFile, numericLiteral: ts.NumericLiteral) {
//   context.output(numericLiteral.getText());
// }
