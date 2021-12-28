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
import { int } from "../shims";
import { BackendContext } from "./backend";

interface ClangBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;
}

export function outputC(sourceFile: SourceFile, baseContext: BackendContext): void {
  const context = <ClangBackendContext>{
    indentLevel: 0,

    indent: () => {
      for (let i = 0; i < context.indentLevel; i++) {
        baseContext.append("\t");
      }
    },

    append: (value: string) => {
      baseContext.append(value);
    },

    prepend: (value: string) => {
      baseContext.prepend(value);
    },
  };

  outputPreamble(context);

  for (const statement of sourceFile.statements) {
    outputTopLevelStatement(context, sourceFile, statement);
  }
}

function outputPreamble(context: ClangBackendContext): void {
  context.append(
    `#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef int32_t i32;
typedef int64_t i64;
typedef uint32_t u32;
typedef uint64_t u64;

#define int i64
#define uint u64

typedef struct string { uint length; const char* data; } string;

int println(string format, ...) {
  va_list ap;
  va_start(ap, format);
  int ret = vprintf(format.data, ap);
  va_end(ap);
  puts("");
  return ret;
}

string sprintf_(string format, string arg) {
  char* data = malloc(sizeof(char) * 1024);
  // TODO: How to pass va_list here correctly to vsprintf_s.
  // va_list ap;
  // va_start(ap, format);
  int length = sprintf_s(data, 1024, format.data, arg.data);
  // va_end(ap);
  return (string){length, data};
}
#define sprintf sprintf_
\n`
  );
}

function outputUnexpectedNode(
  context: ClangBackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode
): void {
  context.append(`/* Unexpected node in ${functionName}:\n`);
  // const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  // context.output(`${sourceFile.fileName} (${line + 1},${character + 1}) ${SyntaxKind[node.kind]} ${message}`);
  context.append(`${sourceFile.fileName} ${SyntaxKind[node.kind]}`);
  context.append("*/\n");
}

function outputTopLevelStatement(context: ClangBackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
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
  context: ClangBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration
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

  context.append(") {\n");
  context.indentLevel += 1;

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      outputBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.indentLevel -= 1;
  context.append(`}\n\n`);
}

function outputBlockLevelStatement(context: ClangBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  context.indent();

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

  context.append(";\n");
}

function outputReturnStatement(context: ClangBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.append("return ");

  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }
}

function outputExpression(context: ClangBackendContext, sourceFile: SourceFile, expression: Expression) {
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

function outputCallExpression(context: ClangBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
  outputExpression(context, sourceFile, callExpression.expression);
  context.append("(");

  for (let i = 0; i < callExpression.arguments.length; i++) {
    if (i != 0) {
      context.append(", ");
    }

    outputExpression(context, sourceFile, callExpression.arguments[i]);
  }

  context.append(")");
}

function outputIdentifier(context: ClangBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function outputIntegerLiteral(context: ClangBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.append(integerLiteral.value);
}

function outputStringLiteral(context: ClangBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.append(`(string){${stringLiteral.value.length}, "${stringLiteral.value}"}`);
}
