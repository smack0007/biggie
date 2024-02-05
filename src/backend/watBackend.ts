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
  TypeNode,
  TypeReference,
  VariableDeclaration,
} from "../frontend/ast.ts";
import { int } from "../shims.ts";
import { BackendContext } from "./backend.ts";

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

interface WatBackendContext {
  output: BackendContext;

  imports: Array<WasmImport>;

  nextDataOffset: number;
  data: Array<WasmData>;
}

export function emitWat(sourceFile: SourceFile, output: BackendContext): void {
  const context: WatBackendContext = {
    output,

    imports: [
      {
        name: "println",
      },
    ],

    nextDataOffset: 0,
    data: [],
  };

  context.output.indentLevel += 1;

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, sourceFile, statement);
  }

  for (let i = context.data.length - 1; i >= 0; i -= 1) {
    context.output.prepend(`\t(data (i32.const ${context.data[i].offset}) ${context.data[i].value})\n`);
  }

  context.output.indentLevel -= 1;

  context.output.prepend(`(module
\t(import "env" "println" (func $println (param i32 i32)))
\t(memory (export "memory") 1 100)\n`);

  context.output.append(")\n");
}

function stringData(context: WatBackendContext, value: string): WasmData {
  // TODO: Check if the given data already exists

  const offset = context.nextDataOffset;

  const data = {
    offset,
    length: value.length,
    type: WasmDataType.i32,
    value: `"${value}"`,
  };

  context.data.push(data);
  context.nextDataOffset += value.length;

  return data;
}

function emitUnexpectedNode(
  context: WatBackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode
): void {
  context.output.indent();
  context.output.append(
    `;; ERROR: Unexpected node in ${functionName}: ${sourceFile.fileName} ${SyntaxKind[node.kind]}\n`
  );
}

function emitTopLevelStatement(context: WatBackendContext, sourceFile: SourceFile, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.FunctionDeclaration:
      emitFunctionDeclaration(context, sourceFile, <FunctionDeclaration>node);
      break;

    default:
      emitUnexpectedNode(context, emitTopLevelStatement.name, sourceFile, node);
      break;
  }
}

function emitFunctionDeclaration(
  context: WatBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FunctionDeclaration
): void {
  const name: string = functionDeclaration.name.value;

  context.output.indent();
  context.output.append(`(func $${name} (export "${name}")`);

  for (const arg of functionDeclaration.arguments) {
    const argName: string = arg.name.value;
    const argType: string = arg.type.value;

    if (argType == "string") {
      context.output.append(` (param $${argName}__offset i32) (param $${argName}__length i32)`);
    } else {
      context.output.append(` (param $${argName} ${argType})`);
    }
  }

  const returnType: string = functionDeclaration.returnType.name.value;
  if (returnType !== "void") {
    if (returnType === "string") {
      context.output.append(` (result i32)`);
    } else {
      context.output.append(` (result ${returnType})`);
    }
  }

  context.output.append("\n");
  context.output.indentLevel += 1;

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      emitBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.output.indentLevel -= 1;
  context.output.indent();
  context.output.append(`)\n`);
}

function emitBlockLevelStatement(context: WatBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  switch (node.kind) {
    case SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, sourceFile, <ExpressionStatement>node);
      break;

    case SyntaxKind.ReturnStatement:
      emitReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    case SyntaxKind.VariableDeclaration:
      emitVariableDeclaration(context, sourceFile, <VariableDeclaration>node);
      break;

    default:
      emitUnexpectedNode(context, emitBlockLevelStatement.name, sourceFile, node);
      break;
  }
}

function emitExpressionStatement(
  context: WatBackendContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement
) {
  emitExpression(context, sourceFile, expressionStatement.expression);
  context.output.append("\n");
}

function emitReturnStatement(context: WatBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.output.indent();

  if (returnStatement.expression == null) {
    context.output.append("(return)\n");
  } else {
    context.output.append("(return ");
    emitExpression(context, sourceFile, returnStatement.expression);
    context.output.append(")\n");
  }
}

function emitVariableDeclaration(
  context: WatBackendContext,
  sourceFile: SourceFile,
  variableDeclaration: VariableDeclaration
) {
  context.output.indent();
  context.output.append("(local ");
  emitIdentifier(context, sourceFile, variableDeclaration.name);
  context.output.append(" ");
  emitType(context, sourceFile, variableDeclaration.type);
  context.output.append(")\n");

  if (variableDeclaration.expression != null) {
    context.output.indent();
    context.output.append("(local.set ");
    emitIdentifier(context, sourceFile, variableDeclaration.name);
    context.output.append(" ");
    emitExpression(context, sourceFile, variableDeclaration.expression);
    context.output.append(")\n");
  }
}

function emitType(context: WatBackendContext, sourceFile: SourceFile, type: TypeNode) {
  switch (type.kind) {
    case SyntaxKind.TypeReference:
      emitTypeReference(context, sourceFile, <TypeReference>type);
      break;

    default:
      emitUnexpectedNode(context, emitType.name, sourceFile, type);
      break;
  }
}

function emitTypeReference(context: WatBackendContext, sourceFile: SourceFile, typeReference: TypeReference) {
  context.output.append(typeReference.name.value);
}

function emitExpression(context: WatBackendContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    case SyntaxKind.CallExpression:
      emitCallExpression(context, sourceFile, <CallExpression>expression);
      break;

    case SyntaxKind.Identifier:
      emitIdentifier(context, sourceFile, <Identifier>expression);
      break;

    case SyntaxKind.IntegerLiteral:
      emitIntegerLiteral(context, sourceFile, <IntegerLiteral>expression);
      break;

    case SyntaxKind.StringLiteral:
      emitStringLiteral(context, sourceFile, <StringLiteral>expression);
      break;

    default:
      emitUnexpectedNode(context, emitExpression.name, sourceFile, expression);
      break;
  }
}

function emitCallExpression(context: WatBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
  let functionName = "";

  if (callExpression.expression.kind === SyntaxKind.Identifier) {
    functionName = (<Identifier>callExpression.expression).value;
  } else {
    context.output.indent();
    context.output.append(";; ERROR: Dynamic function calls not implemented.");
    return;
  }

  // TODO: Remove the $ when function lookup properly implemented.
  functionName = "$" + functionName;

  context.output.indent();
  context.output.append(`(call ${functionName} `);

  for (let i = 0; i < callExpression.arguments.length; i++) {
    emitExpression(context, sourceFile, callExpression.arguments[i]);
  }

  context.output.append(")");
}

function emitIdentifier(context: WatBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.output.append("$");
  context.output.append(identifier.value);
}

function emitIntegerLiteral(context: WatBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.output.append(`(i32.const ${integerLiteral.value})`);
}

function emitStringLiteral(context: WatBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  const data = stringData(context, stringLiteral.value);
  context.output.append(`(i32.const ${data.offset}) (i32.const ${data.length})`);
}
