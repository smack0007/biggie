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

interface WasmImport {
  name: string;
}

enum WasmDataType {
  i32 = "i32",
}

interface WasmData {
  offset: i32;
  length: i32;
  type: WasmDataType;
  value: string;
}

interface WatBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;

  imports: Array<WasmImport>;
  data: Array<WasmData>;
}

export function outputWat(sourceFile: SourceFile, baseContext: BackendContext): void {
  const context = <WatBackendContext>{
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

    imports: [
      {
        name: "println",
      },
    ],
    data: [],
  };

  context.indentLevel += 1;

  for (const statement of sourceFile.statements) {
    outputTopLevelStatement(context, sourceFile, statement);
  }

  for (let i = context.data.length - 1; i >= 0; i -= 1) {
    context.prepend(`\t(data (i32.const ${context.data[i].offset}) ${context.data[i].value})\n`);
  }

  context.indentLevel -= 1;

  context.prepend(`(module
\t(import "js" "memory" (memory 1))
\t(import "js" "println" (func $println (param i32 i32)))\n`);

  context.append(")\n");
}

function stringData(context: WatBackendContext, value: string): WasmData {
  // TODO: Check if the given data already exists

  const offset = context.data.length * 4;

  const data = {
    offset,
    length: value.length,
    type: WasmDataType.i32,
    value: `"${value}"`,
  };

  context.data.push(data);

  return data;
}

function outputUnexpectedNode(
  context: WatBackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode
): void {
  context.indent();
  context.append(`;; ERROR: Unexpected node in ${functionName}: ${sourceFile.fileName} ${SyntaxKind[node.kind]}\n`);
}

function outputTopLevelStatement(context: WatBackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
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
  context: WatBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration
): void {
  const name: string = functionDeclaration.name.value;

  context.indent();
  context.append(`(func $${name} (export "${name}")`);

  for (const arg of functionDeclaration.arguments) {
    const argName: string = arg.name.value;
    const argType: string = arg.type.value;

    if (argType == "string") {
      context.append(` (param $${argName}__offset i32) (param $${argName}__length i32)`);
    } else {
      context.append(` (param $${argName} ${argType})`);
    }
  }

  const returnType: string = functionDeclaration.returnType.name.value;
  if (returnType !== "void") {
    if (returnType === "string") {
      context.append(` (result i32)`);
    } else {
      context.append(` (result ${returnType})`);
    }
  }

  context.append("\n");
  context.indentLevel += 1;

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      outputBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.indentLevel -= 1;
  context.indent();
  context.append(`)\n`);
}

function outputBlockLevelStatement(context: WatBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
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
  context: WatBackendContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement
) {
  outputExpression(context, sourceFile, expressionStatement.expression);
  context.append("\n");
}

function outputReturnStatement(context: WatBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
    context.append("\n");
  }

  context.indent();
  context.append("(return)\n");
}

function outputExpression(context: WatBackendContext, sourceFile: SourceFile, expression: Expression) {
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

function outputCallExpression(context: WatBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
  let functionName = "";

  if (callExpression.expression.kind === SyntaxKind.Identifier) {
    functionName = (<Identifier>callExpression.expression).value;
  } else {
    context.indent();
    context.append(";; ERROR: Dynamic function calls not implemented.");
    return;
  }

  // TODO: Remove the $ when function lookup properly implemented.
  functionName = "$" + functionName;

  context.indent();
  context.append(`(call ${functionName} `);

  for (let i = 0; i < callExpression.arguments.length; i++) {
    outputExpression(context, sourceFile, callExpression.arguments[i]);
  }

  context.append(")");
}

function outputIdentifier(context: WatBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function outputIntegerLiteral(context: WatBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.indent();
  context.append(`(i32.const ${integerLiteral.value})`);
}

function outputStringLiteral(context: WatBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  const data = stringData(context, stringLiteral.value);
  context.append(`(i32.const ${data.offset}) (i32.const ${data.length})`);
}
