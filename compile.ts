import { readFileSync } from "fs";
import * as ts from "typescript";

const fileNames = process.argv.slice(2);
fileNames.forEach((fileName) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  outputPreamble();

  for (const statement of sourceFile.statements) {
    parseTopLevelStatement(sourceFile, statement);
  }
});

function write(data: string) {
  process.stdout.write(data);
}

function outputPreamble() {
  write("#include <stdio.h>\n");
  write("\n");
  write("typedef signed int i32;");
  write("\n");
}

function logNode(sourceFile: ts.SourceFile, node: ts.Node, message: string = "") {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  write(`${sourceFile.fileName} (${line + 1},${character + 1}) ${ts.SyntaxKind[node.kind]} ${message}`);
}

function parseTopLevelStatement(sourceFile: ts.SourceFile, node: ts.Node) {
  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration:
      parseFunctionDeclaration(sourceFile, node as ts.FunctionDeclaration);
      break;

    default:
      write(`/* Unexpected node in ${parseTopLevelStatement.name}:\n`);
      logNode(sourceFile, node);
      write("*/\n");
      break;
  }
}

function parseFunctionDeclaration(sourceFile: ts.SourceFile, functionDeclaration: ts.FunctionDeclaration) {
  const returnType = functionDeclaration.type?.getText();
  const name = functionDeclaration.name?.getText();

  write(`${returnType} ${name}() {\n`);

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      parseFunctionStatement(sourceFile, statement);
    }
  }

  write(`}\n`);
}

function parseFunctionStatement(sourceFile: ts.SourceFile, node: ts.Node) {
  switch (node.kind) {
    case ts.SyntaxKind.ExpressionStatement:
      parseExpression(sourceFile, (node as ts.ExpressionStatement).expression);
      break;

    case ts.SyntaxKind.ReturnStatement:
      parseReturnStatement(sourceFile, node as ts.ReturnStatement);
      break;

    default:
      write(`/* Unexpected node in ${parseFunctionStatement.name}:\n`);
      logNode(sourceFile, node);
      write("*/\n");
      break;
  }

  write(";\n");
}

function parseReturnStatement(sourceFile: ts.SourceFile, returnStatement: ts.ReturnStatement) {
  write("return ");

  if (returnStatement.expression) {
    parseExpression(sourceFile, returnStatement.expression);
  }
}

function parseExpression(sourceFile: ts.SourceFile, expression: ts.Expression) {
  switch (expression.kind) {
    case ts.SyntaxKind.CallExpression:
      write(expression.getText());
      break;

    case ts.SyntaxKind.NumericLiteral:
      parseNumericLiteral(sourceFile, expression as ts.NumericLiteral);
      break;

    default:
      write(`/* Unexpected node in ${parseExpression.name}:\n`);
      logNode(sourceFile, expression);
      write("*/\n");
      break;
  }
}

function parseNumericLiteral(sourceFile: ts.SourceFile, numericLiteral: ts.NumericLiteral) {
  write(numericLiteral.getText());
}
