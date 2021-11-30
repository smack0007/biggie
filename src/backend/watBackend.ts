import {
  FunctionDeclaration,
  IntegerLiteral,
  ReturnStatement,
  SourceFile,
  SyntaxKind,
  SyntaxNode,
} from "../frontend/ast";
import { int } from "../shims";
import { BackendContext } from "./backend";

interface WatBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;
}

export function outputWat(sourceFile: SourceFile, baseContext: BackendContext): void {
  const context = <WatBackendContext>{
    indentLevel: 0,

    indent: () => {
      for (let i = 0; i < context.indentLevel; i++) {
        baseContext.output("\t");
      }
    },

    output: (value: string) => {
      baseContext.output(value);
    },
  };

  context.output("(module\n");
  context.indentLevel += 1;

  for (const statement of sourceFile.statements) {
    outputTopLevelStatement(context, sourceFile, statement);
  }

  context.indentLevel -= 1;
  context.output(")\n");
}

function outputUnexpectedNode(
  context: WatBackendContext,
  functionName: string,
  sourceFile: SourceFile,
  node: SyntaxNode
): void {
  context.indent();
  context.output(`;; Unexpected node in ${functionName}: ${sourceFile.fileName} ${SyntaxKind[node.kind]}\n`);
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
  const returnType: string = functionDeclaration.returnType.name.value;
  const name: string = functionDeclaration.name.value;

  context.indent();
  context.output(`(func $${name} (export "${name}")`);

  // TODO: Function arguments

  if (returnType !== "void") {
    context.output(` (result ${returnType})`);
  }

  context.output("\n");
  context.indentLevel += 1;

  if (functionDeclaration.body?.statements) {
    for (const statement of functionDeclaration.body.statements) {
      outputBlockLevelStatement(context, sourceFile, statement);
    }
  }

  context.indentLevel -= 1;
  context.indent();
  context.output(`)\n`);
}

function outputBlockLevelStatement(context: WatBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  switch (node.kind) {
    // case SyntaxKind.ExpressionStatement:
    //   outputExpressionStatement(context, sourceFile, <ExpressionStatement>node);
    //   break;

    case SyntaxKind.ReturnStatement:
      outputReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    default:
      outputUnexpectedNode(context, outputBlockLevelStatement.name, sourceFile, node);
      break;
  }
}

// function outputExpressionStatement(
//   context: WatBackendContext,
//   sourceFile: SourceFile,
//   expressionStatement: ExpressionStatement
// ) {
//   outputExpression(context, sourceFile, expressionStatement.expression);
//   context.output(";\n");
// }

function outputReturnStatement(context: WatBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }

  context.indent();
  context.output("return\n");
}

function outputExpression(context: WatBackendContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    // case SyntaxKind.CallExpression:
    //   outputCallExpression(context, sourceFile, <CallExpression>expression);
    //   break;

    // case SyntaxKind.Identifier:
    //   outputIdentifier(context, sourceFile, <Identifier>expression);
    //   break;

    case SyntaxKind.IntegerLiteral:
      outputIntegerLiteral(context, sourceFile, <IntegerLiteral>expression);
      break;

    // case SyntaxKind.StringLiteral:
    //   outputStringLiteral(context, sourceFile, <StringLiteral>expression);
    //   break;

    default:
      outputUnexpectedNode(context, outputExpression.name, sourceFile, expression);
      break;
  }
}

// function outputCallExpression(context: WatBackendContext, sourceFile: SourceFile, callExpression: CallExpression) {
//   outputExpression(context, sourceFile, callExpression.expression);
//   context.output("(");

//   for (let i = 0; i < callExpression.arguments.length; i++) {
//     if (i != 0) {
//       context.output(", ");
//     }

//     outputExpression(context, sourceFile, callExpression.arguments[i]);
//   }

//   context.output(")");
// }

// function outputIdentifier(context: WatBackendContext, sourceFile: SourceFile, identifier: Identifier) {
//   context.output(identifier.value);
// }

function outputIntegerLiteral(context: WatBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.indent();
  context.output(`i32.const ${integerLiteral.value}\n`);
}

// function outputStringLiteral(context: WatBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
//   context.output('"');
//   context.output(stringLiteral.value);
//   context.output('"');
// }
