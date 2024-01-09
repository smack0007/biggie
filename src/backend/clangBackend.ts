import * as fs from "node:fs";
import * as path from "node:path";
import {
  AdditiveExpression,
  AssignmentExpression,
  BoolLiteral,
  CallExpression,
  ComparisonExpression,
  DeferStatement,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FuncDeclaration,
  Identifier,
  IfStatement,
  IntegerLiteral,
  LogicalExpression,
  MultiplcativeExpression,
  Operator,
  ParenthesizedExpression,
  ReturnStatement,
  SourceFile,
  StatementBlock,
  StringLiteral,
  SyntaxKind,
  SyntaxNode,
  UnaryExpression,
  VarDeclaration,
  WhileStatement,
} from "../frontend/ast.ts";
import { int } from "../shims.ts";
import { BackendContext } from "./backend.ts";

interface ClangBackendContext extends BackendContext {
  indentLevel: int;
  indent: () => void;
}

export function outputCpp(sourceFile: SourceFile, baseContext: BackendContext): void {
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
  context.append("#include <biggie.cpp>");
  context.append("\n");
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
    case SyntaxKind.FuncDeclaration:
      outputFunctionDeclaration(context, sourceFile, <FuncDeclaration>node);
      break;

    default:
      outputUnexpectedNode(context, outputTopLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputFunctionDeclaration(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  functionDeclaration: FuncDeclaration
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

  
  for (const statement of functionDeclaration.body.statements) {
    outputBlockLevelStatement(context, sourceFile, statement);
  }

  context.indentLevel -= 1;
  context.append(`}\n\n`);
}

function outputBlockLevelStatement(context: ClangBackendContext, sourceFile: SourceFile, node: SyntaxNode) {
  context.indent();

  switch (node.kind) {
    case SyntaxKind.DeferStatement:
      outputDeferStatement(context, sourceFile, <DeferStatement>node);
      break;

    case SyntaxKind.ExpressionStatement:
      outputExpressionStatement(context, sourceFile, <ExpressionStatement>node);
      break;

    case SyntaxKind.IfStatement:
      outputIfStatement(context, sourceFile, <IfStatement>node);
      break;

    case SyntaxKind.ReturnStatement:
      outputReturnStatement(context, sourceFile, <ReturnStatement>node);
      break;

    case SyntaxKind.StatementBlock:
      outputStatementBlock(context, sourceFile, <StatementBlock>node);
      break;

    case SyntaxKind.VarDeclaration:
      outputVarDeclaration(context, sourceFile, <VarDeclaration>node);
      break;

    case SyntaxKind.WhileStatement:
      outputWhileStatement(context, sourceFile, <WhileStatement>node);
      break;

    default:
      outputUnexpectedNode(context, outputBlockLevelStatement.name, sourceFile, node);
      break;
  }
}

function outputDeferStatement(context: ClangBackendContext, sourceFile: SourceFile, deferStatement: DeferStatement) {
  context.append("defer { ");

  // TODO: We probably need to use something like outputStatementBlock here.
  outputExpression(context, sourceFile, deferStatement.expression);

  // HACK: DeferStatement should contain a StatementBlock.
  context.append(";");
  context.append(" }");
  context.append(";\n");
}

function outputExpressionStatement(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expressionStatement: ExpressionStatement
) {
  outputExpression(context, sourceFile, expressionStatement.expression);
  context.append(";\n");
}

function outputIfStatement(context: ClangBackendContext, sourceFile: SourceFile, ifStatement: IfStatement) {
  context.append("if (");
  outputExpression(context, sourceFile, ifStatement.condition);
  context.append(") ");
  outputBlockLevelStatement(context, sourceFile, ifStatement.then);

  if (ifStatement.else != null) {
    context.append(" else ");
    outputBlockLevelStatement(context, sourceFile, ifStatement.else);
  }

  context.append("\n");
}

function outputReturnStatement(context: ClangBackendContext, sourceFile: SourceFile, returnStatement: ReturnStatement) {
  context.append("return ");

  if (returnStatement.expression != null) {
    outputExpression(context, sourceFile, returnStatement.expression);
  }

  context.append(";\n");
}

function outputStatementBlock(context: ClangBackendContext, sourceFile: SourceFile, statementBlock: StatementBlock) {
  context.append("{\n");
  context.indentLevel += 1;

  for (const statement of statementBlock.statements) {
    context.indent();
    outputBlockLevelStatement(context, sourceFile, statement);
  }

  context.indentLevel -= 1;
  context.indent();
  context.append("}");
}

function outputVarDeclaration(context: ClangBackendContext, sourceFile: SourceFile, varDeclaration: VarDeclaration) {
  outputIdentifier(context, sourceFile, varDeclaration.type.name);
  context.append(" ");
  outputIdentifier(context, sourceFile, varDeclaration.name);

  if (varDeclaration.expression != null) {
    context.append(" = ");
    outputExpression(context, sourceFile, varDeclaration.expression);
  }

  context.append(";\n");
}

function outputWhileStatement(context: ClangBackendContext, sourceFile: SourceFile, whileStatement: WhileStatement) {
  context.append("while (");
  outputExpression(context, sourceFile, whileStatement.condition);
  context.append(") ");
  outputBlockLevelStatement(context, sourceFile, whileStatement.body);
  context.append("\n");
}

function outputExpression(context: ClangBackendContext, sourceFile: SourceFile, expression: Expression) {
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
      outputIntegerLiteral(context, sourceFile, <IntegerLiteral>expression);
      break;

    case SyntaxKind.LogicalExpression:
      outputLogicalExpression(context, sourceFile, <LogicalExpression>expression);
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

function outputAssignmentExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: AssignmentExpression
): void {
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

function outputAdditiveExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: AdditiveExpression
): void {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(` ${expression.operator == Operator.Plus ? "+" : "-"} `);

  outputExpression(context, sourceFile, expression.rhs);
}

function outputBoolLiteral(context: ClangBackendContext, sourceFile: SourceFile, boolLiteral: BoolLiteral) {
  context.append(boolLiteral.value ? "true" : "false");
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

function outputComparisonExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: ComparisonExpression
) {
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

function outputEqualityExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: EqualityExpression
) {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.EqualsEquals ? " == " : " != ");

  outputExpression(context, sourceFile, expression.rhs);
}

function outputIdentifier(context: ClangBackendContext, sourceFile: SourceFile, identifier: Identifier) {
  context.append(identifier.value);
}

function outputIntegerLiteral(context: ClangBackendContext, sourceFile: SourceFile, integerLiteral: IntegerLiteral) {
  context.append(integerLiteral.value);
}

function outputLogicalExpression(context: ClangBackendContext, sourceFile: SourceFile, expression: LogicalExpression) {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.AmpersandAmpersand ? " && " : " || ");

  outputExpression(context, sourceFile, expression.rhs);
}

function outputMultiplicativeExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: MultiplcativeExpression
) {
  outputExpression(context, sourceFile, expression.lhs);

  context.append(expression.operator == Operator.Asterisk ? " * " : " / ");

  outputExpression(context, sourceFile, expression.rhs);
}

function outputParenthesizedExpression(
  context: ClangBackendContext,
  sourceFile: SourceFile,
  expression: ParenthesizedExpression
) {
  context.append("(");
  outputExpression(context, sourceFile, expression.expression);
  context.append(")");
}

function outputStringLiteral(context: ClangBackendContext, sourceFile: SourceFile, stringLiteral: StringLiteral) {
  context.append(`"${stringLiteral.value}"`);
}

function outputUnaryExpression(context: ClangBackendContext, sourceFile: SourceFile, expression: UnaryExpression) {
  context.append(expression.operator == Operator.Exclamation ? "!" : "-");

  outputExpression(context, sourceFile, expression.expression);
}
