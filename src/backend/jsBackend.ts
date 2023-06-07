import * as fs from "node:fs";
import * as path from "node:path";
import {
  BoolLiteral,
  CallExpression,
  ComparisonExpression,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FuncDeclaration,
  Identifier,
  IntegerLiteral as IntLiteral,
  Operator,
  ReturnStatement,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  SyntaxNode,
  VarDeclaration,
  AdditiveExpression,
  MultiplcativeExpression,
  UnaryExpression,
  ParenthesizedExpression,
  AssignmentExpression,
} from "../frontend/ast";
import { int } from "../shims";
import { BackendContext } from "./backend";

interface JSBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;
}

function debugObj(context: JSBackendContext, value: unknown, message?: string, newLine: boolean = true): void {
  context.append(`/*${message ? message + ": " : ""}${JSON.stringify(value, undefined, 2)}*/${newLine ? "\n" : ""}`);
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

  debugObj(context, sourceFile);
  context.append("\n");

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
  context.append(`/* Unexpected node in "${functionName}": ${SyntaxKind[node.kind]} ${sourceFile.fileName} */`);
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
  context.append(`${varDeclaration.isConst ? "const" : "let"} ${varDeclaration.name.value}`);

  if (varDeclaration.expression) {
    context.append("=");
    outputExpression(context, sourceFile, varDeclaration.expression);
  }
}

function outputReturnStatement(context: JSBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.append("return ");

  if (returnStatement.expression) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }
}

function outputExpression(context: JSBackendContext, sourceFile: SourceFile, expression: Expression) {
  switch (expression.kind) {
    case SyntaxKind.AdditiveExpression:
      outputAdditiveExpression(context, sourceFile, <AdditiveExpression>expression);
      break;

    case SyntaxKind.AssignmentExpression:
      outputAssignmentExpression(context, sourceFile, <AssignmentExpression>expression);  
      break;

    case SyntaxKind.BoolLiteral:
      outputBoolLiteral(context, sourceFile, <BoolLiteral>expression);
      break;

    case SyntaxKind.CallExpression:
      outputCallExpression(context, sourceFile, <CallExpression>expression);
      break;

    case SyntaxKind.ComparisonExpression:
      outputComparisonExpression(context, sourceFile, <ComparisonExpression>expression);
      break;
        
    case SyntaxKind.EqualityExpression:
      outputEqualityExpression(context, sourceFile, <EqualityExpression>expression);
      break;

    case SyntaxKind.Identifier:
      outputIdentifier(context, sourceFile, <Identifier>expression);
      break;

    case SyntaxKind.IntegerLiteral:
      outputIntLiteral(context, sourceFile, <IntLiteral>expression);
      break;

    case SyntaxKind.MultiplicativeExpression:
      outputMultiplicativeExpression(context, sourceFile, <MultiplcativeExpression>expression);
      break;

    case SyntaxKind.ParenthesizedExpression:
      outputParenthesizedExpression(context, sourceFile, <ParenthesizedExpression>expression);  
      break;

    case SyntaxKind.StringLiteral:
      outputStringLiteral(context, sourceFile, <StringLiteral>expression);
      break;

    case SyntaxKind.UnaryExpression:
      outputUnaryExpression(context, sourceFile, <UnaryExpression>expression);
      break;

    default:
      outputUnexpectedNode(context, outputExpression.name, sourceFile, expression);
      break;
  }
}

function outputAssignmentExpression(context: JSBackendContext, sourceFile: SourceFile, expression: AssignmentExpression): void {
  outputIdentifier(context, sourceFile, expression.name);
  
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

  outputExpression(context, sourceFile, expression.value);
}

function outputAdditiveExpression(context: JSBackendContext, sourceFile: SourceFile, expression: AdditiveExpression): void {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(` ${expression.operator == Operator.Plus ? "+" : "-"} `);

  outputExpression(context, sourceFile, expression.rhs);
}

function outputBoolLiteral(context: JSBackendContext, sourceFile: SourceFile, boolLiteral: BoolLiteral) {
  context.append(boolLiteral.value ? "true" : "false");
}

function outputCallExpression(context: JSBackendContext, sourceFile: SourceFile, expression: CallExpression) {
  outputExpression(context, sourceFile, expression.expression);
  context.append("(");

  for (let i = 0; i < expression.arguments.length; i++) {
    if (i != 0) {
      context.append(", ");
    }

    outputExpression(context, sourceFile, expression.arguments[i]);
  }

  context.append(")");
}

function outputComparisonExpression(context: JSBackendContext, sourceFile: SourceFile, expression: ComparisonExpression) {
  outputExpression(context, sourceFile, expression.lhs);

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

  outputExpression(context, sourceFile, expression.rhs);
}

function outputEqualityExpression(context: JSBackendContext, sourceFile: SourceFile, expression: EqualityExpression) {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.EqualsEquals ? " === " : " !== ");

  outputExpression(context, sourceFile, expression.rhs);
}

function outputIdentifier(context: JSBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function outputIntLiteral(context: JSBackendContext, sourceFile: SourceFile, integerLiteral: IntLiteral) {
  context.append(integerLiteral.value);
}

function outputMultiplicativeExpression(context: JSBackendContext, sourceFile: SourceFile, expression: MultiplcativeExpression) {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.Asterisk ? " * " : " / ");

  outputExpression(context, sourceFile, expression.rhs);
}

function outputParenthesizedExpression(context: JSBackendContext, sourceFile: SourceFile, expression: ParenthesizedExpression) {
  context.append("(");
  outputExpression(context, sourceFile, expression.expression);
  context.append(")");
}

function outputStringLiteral(context: JSBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.append(`"${stringLiteral.value}"`);
}

function outputUnaryExpression(context: JSBackendContext, sourceFile: SourceFile, expression: UnaryExpression) {
  context.append(expression.operator == Operator.Exclamation ? "!" : "-");

  outputExpression(context, sourceFile, expression.expression);
}