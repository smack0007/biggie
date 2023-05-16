import * as fs from "node:fs";
import * as path from "node:path";
import {
  CallExpression,
  Expression,
  ExpressionStatement,
  FuncDeclaration,
  Identifier,
  IntegerLiteral,
  ReturnStatement,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  SyntaxNode,
  VarDeclaration,
} from "../frontend/ast";
import { int } from "../shims";
import { BackendContext } from "./backend";

interface JSBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;
}

const PREAMBLE = fs.readFileSync(path.join(__dirname, "jsPreamble.js"), "utf-8");
const POSTAMBLE = fs.readFileSync(path.join(__dirname, "jsPostamble.js"), "utf-8");

export function outputJS(sourceFile: SourceFile, baseContext: BackendContext): void {
  const context = <JSBackendContext>{
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

  outputPostamble(context);
}

function outputPreamble(context: JSBackendContext): void {
  context.append(PREAMBLE);
  context.append("\n");
}

function outputPostamble(context: JSBackendContext): void {
  context.append("\n");
  context.append(POSTAMBLE);
}

function outputUnexpectedNode(
  context: JSBackendContext,
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

function outputTopLevelStatement(context: JSBackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.FuncDeclaration:
      outputFunctionDeclaration(context, sourceFile, <FuncDeclaration>node);
      break;

    default:
      outputUnexpectedNode(context, outputTopLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputFunctionDeclaration(
  context: JSBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FuncDeclaration
): void {
  const returnType: string = functionDeclaration.returnType.name.value;
  const name: string = functionDeclaration.name.value;

  context.append(`function ${name}(`);

  for (let i = 0; i < functionDeclaration.arguments.length; i++) {
    const arg = functionDeclaration.arguments[i];
    const argType = arg.type.value;
    const argName = arg.name.value;

    if (i != 0) {
      context.append(", ");
    }

    context.append(`${argName} /* ${argType} */`);
  }

  context.append(`) /* ${returnType} */ {\n`);
  context.indentLevel += 1;

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      outputBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.indentLevel -= 1;
  context.append(`}\n\n`);
}

function outputBlockLevelStatement(context: JSBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  context.indent();

  switch (node.kind) {
    case SyntaxKind.VarDeclaration:
      outputVarDeclaration(context, sourceFile, (<VarDeclaration>node));
      break;
    
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

function outputVarDeclaration(context: JSBackendContext, sourceFile: SourceFile, varDeclaration: VarDeclaration) {
  context.indent();
  
  // TODO: Implement let
  context.append(`const ${varDeclaration.name.value}`);

  if (varDeclaration.expression) {
    context.append("=");
    outputExpression(context, sourceFile, varDeclaration.expression);
  }

  context.append(";\n");
}

function outputReturnStatement(context: JSBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.append("return ");

  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }
}

function outputExpression(context: JSBackendContext, sourceFile: SourceFile, expression: Expression) {
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

function outputCallExpression(context: JSBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
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

function outputIdentifier(context: JSBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function outputIntegerLiteral(context: JSBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.append(integerLiteral.value);
}

function outputStringLiteral(context: JSBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.append(`"${stringLiteral.value}"`);
}
