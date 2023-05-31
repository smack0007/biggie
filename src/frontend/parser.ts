import {
  StatementBlock,
  FuncDeclaration,
  Identifier,
  SourceFile,
  Statement,
  SyntaxKind,
  TypeName,
  Expression,
  ReturnStatement,
  ExpressionStatement,
  IntegerLiteral,
  StringLiteral,
  CallExpression,
  FunctionArgument,
  DeferStatement,
  VarDeclaration,
  EqualityExpression,
  ComparisonExpression,
  BinaryOperator,
  BoolLiteral,
  AdditiveExpression,
  UnaryExpression,
  UnaryOperator,
  MultiplcativeExpression,
  ParenthesizedExpression,
  AssignmentExpression,
} from "./ast";
import { Token, TokenType } from "./scanner";
import { bool, Result, int, OrNull } from "../shims";

export interface ParserLogger {
  enter(name: string, token: Token): void;
}

interface ParserContext {
  fileName: string;
  tokens: Array<Token>;
  logger: {
    enter(name: string): void;
  };

  index: int;
}

export enum ParserErrorKind {
  InvalidAssignmentTarget,

  UnexpectedTokenType,
  UnknownTopLevelStatement,
  UnknownBlockLevelStatement,
  UnknownExpression,
}

export interface ParserError {
  kind: ParserErrorKind;
  line: int;
  column: int;
  message?: string;
}

function createError(token: Token, kind: ParserErrorKind, message?: string): ParserError {
  return {
    kind,
    line: token.line,
    column: token.column,
    message,
  };
}

function advance(context: ParserContext): Token {
  if (!isEOF(context)) {
    context.index += 1;
  }
  return previous(context);
}

function check(context: ParserContext, type: TokenType): bool {
  if (isEOF(context)) {
    return false;
  }
  return peek(context).type == type;
}

function isEOF(context: ParserContext): bool {
  if (context.index >= context.tokens.length) {
    return true;
  }
  return peek(context).type == TokenType.EOF;
}

function match(context: ParserContext, ...types: Array<TokenType>): bool {
  for (const type of types) {
    if (check(context, type)) {
      advance(context);
      return true;
    }
  }
  return false;
}

function peek(context: ParserContext): Token {
  return context.tokens[context.index < context.tokens.length ? context.index : context.tokens.length - 1];
}

function previous(context: ParserContext): Token {
  const index = context.index > 0 ? context.index - 1 : 0;
  return context.tokens[index < context.tokens.length ? index : context.tokens.length - 1];
}

function expect(
  context: ParserContext,
  expectedType: TokenType | TokenType[],
  functionName: string
): Result<Token, ParserError> {
  const token = peek(context);

  if (Array.isArray(expectedType)) {
    if (!expectedType.includes(token.type)) {
      return {
        error: createError(
          token,
          ParserErrorKind.UnexpectedTokenType,
          `Expected Token of Type ${expectedType.map((x) => TokenType[x]).join(" | ")} but was ${
            TokenType[token.type]
          } at ${functionName}`
        ),
      };
    }
  } else {
    if (token.type != expectedType) {
      return {
        error: createError(
          token,
          ParserErrorKind.UnexpectedTokenType,
          `Expected Token of Type ${TokenType[expectedType]} but was ${TokenType[token.type]} at ${functionName}`
        ),
      };
    }
  }

  return { value: token };
}

export function parse(fileName: string, tokens: Array<Token>, logger?: ParserLogger): Result<SourceFile, ParserError> {
  const statements: Array<Statement> = [];

  const context: ParserContext = {
    fileName,
    tokens: tokens,
    logger: {
      enter(name: string) {
        logger?.enter(name, context.tokens[context.index]);
      },
    },
    index: 0,
  };

  context.logger.enter(parse.name);

  while (!isEOF(context)) {
    const statement = parseTopLevelStatement(context);

    if (statement.error != null) {
      return { error: statement.error };
    }

    statements.push(statement.value!);
  }

  const eof = expect(context, TokenType.EOF, parse.name);

  if (eof.error != null) {
    return { error: eof.error };
  }

  return {
    value: {
      kind: SyntaxKind.SourceFile,
      fileName,
      statements,
    },
  };
}

function parseTopLevelStatement(context: ParserContext): Result<Statement, ParserError> {
  context.logger.enter(parseTopLevelStatement.name);
  const token = peek(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Const:
    case TokenType.Let:
      result = parseVarDeclaration(context);
      break;

    case TokenType.Func:
      result = parseFuncDeclaration(context);
      break;

    default:
      return {
        error: createError(
          token,
          ParserErrorKind.UnknownTopLevelStatement,
          `Token type ${TokenType[token.type]} unexpected in ${parseTopLevelStatement.name}`
        ),
      };
  }

  return result;
}

function parseVarDeclaration(context: ParserContext): Result<VarDeclaration, ParserError> {
  context.logger.enter(parseVarDeclaration.name);
  let token = expect(context, [TokenType.Const, TokenType.Let], parseFuncDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  const isConst = token.value!.type == TokenType.Const;

  advance(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = expect(context, TokenType.Colon, parseVarDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const type = parseTypeName(context);

  if (type.error != null) {
    return { error: type.error };
  }

  let expression: Result<Expression, ParserError> = {};

  if (check(context, TokenType.Equal)) {
    advance(context);
    expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }
  }

  token = expect(context, TokenType.EndStatement, parseVarDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.VarDeclaration,
      isConst,
      name: identifier.value!,
      expression: expression.value!,
    },
  };
}

function parseFuncDeclaration(context: ParserContext): Result<FuncDeclaration, ParserError> {
  context.logger.enter(parseFuncDeclaration.name);
  let token = expect(context, TokenType.Func, parseFuncDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = expect(context, TokenType.OpenParen, parseFuncDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  const args: Array<FunctionArgument> = [];
  while (check(context, TokenType.Identifier)) {
    const arg = parseFunctionArgument(context);

    if (arg.error) {
      return { error: arg.error };
    }

    args.push(<FunctionArgument>arg.value);
  }

  token = expect(context, TokenType.CloseParen, parseFuncDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  token = expect(context, TokenType.Colon, parseFuncDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const returnType = parseTypeName(context);

  const body = parseStatementBlock(context);

  if (body.error != null) {
    return { error: body.error };
  }

  return {
    value: {
      kind: SyntaxKind.FuncDeclaration,
      body: <StatementBlock>body.value,
      name: <Identifier>identifier.value,
      arguments: args,
      returnType: <TypeName>returnType.value,
    },
  };
}

function parseFunctionArgument(context: ParserContext): Result<FunctionArgument, ParserError> {
  context.logger.enter(parseFunctionArgument.name);

  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  const token = expect(context, TokenType.Colon, parseFunctionArgument.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  const type = parseIdentifier(context);

  if (type.error != null) {
    return { error: type.error };
  }

  return {
    value: {
      kind: SyntaxKind.FuncArgument,
      name: name.value!,
      type: type.value!,
    },
  };
}

function parseStatementBlock(context: ParserContext): Result<StatementBlock, ParserError> {
  context.logger.enter(parseStatementBlock.name);
  let token = expect(context, TokenType.OpenBrace, parseStatementBlock.name);

  if (token.error != null) {
    return { error: token.error };
  }

  const statements: Array<Statement> = [];

  advance(context);
  while (!isEOF(context) && peek(context).type != TokenType.CloseBrace) {
    const statement = parseBlockLevelStatement(context);

    if (statement.error) {
      return { error: statement.error };
    }

    statements.push(statement.value!);
  }

  token = expect(context, TokenType.CloseBrace, parseStatementBlock.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StatementBlock,
      statements,
    },
  };
}

function parseBlockLevelStatement(context: ParserContext): Result<Statement, ParserError> {
  context.logger.enter(parseBlockLevelStatement.name);
  const token = peek(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Const:
    case TokenType.Let:
      result = parseVarDeclaration(context);
      break;

    case TokenType.Defer:
      result = parseDeferStatement(context);
      break;

    case TokenType.Return:
      result = parseReturnStatement(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return result;
}

function parseExpressionStatement(context: ParserContext): Result<ExpressionStatement, ParserError> {
  context.logger.enter(parseExpressionStatement.name);
  const expression = parseExpression(context);

  if (expression.error != null) {
    return { error: expression.error };
  }

  const token = expect(context, TokenType.EndStatement, parseExpressionStatement.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ExpressionStatement,
      expression: <Expression>expression.value,
    },
  };
}

function parseDeferStatement(context: ParserContext): Result<DeferStatement, ParserError> {
  context.logger.enter(parseReturnStatement.name);
  let token = expect(context, TokenType.Defer, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  advance(context);
  const expression = parseExpression(context);

  if (expression.error) {
    return { error: expression.error };
  }

  expect(context, TokenType.EndStatement, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.DeferStatement,
      expression: <Expression>expression.value,
    },
  };
}

function parseReturnStatement(context: ParserContext): Result<ReturnStatement, ParserError> {
  context.logger.enter(parseReturnStatement.name);
  let token = expect(context, TokenType.Return, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  advance(context);
  const expression = parseExpression(context);

  if (expression.error) {
    return { error: expression.error };
  }

  expect(context, TokenType.EndStatement, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ReturnStatement,
      expression: <Expression>expression.value,
    },
  };
}

function parseExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseExpression.name);
  
  let result: Result<Expression, ParserError> = parseAssignmentExpression(context);

  if (result.error != null) {
    return { error: result.error };
  }

  const token = peek(context);
  if (token.type == TokenType.OpenParen) {
    result = parseCallExpression(context, <Expression>result.value);
  }

  return result;
}

function parseAssignmentExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseAssignmentExpression.name);
  
  const startToken = peek(context);
  const expression = parseEqualityExpression(context);

  if (expression.error) {
    return expression;
  }

  if (match(context, TokenType.Equal)) {
    const value = parseAssignmentExpression(context);

    if (value.error) {
      return { error: value.error };
    }

    if (expression.value!.kind != SyntaxKind.Identifier) {
      return { error: createError(startToken, ParserErrorKind.InvalidAssignmentTarget, "Invalid assignment target.") };
    }

    const result: Result<AssignmentExpression, ParserError> = {
      value: {
        kind: SyntaxKind.AssignmentExpression,
        name: <Identifier>expression.value!,
        value: value.value!
      }
    };

    return result;
  } else {
    return expression;
  }
}

function parseEqualityExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseEqualityExpression.name);
  
  const lhs = parseComparisonExpression(context);

  if (lhs.error != null) {
    return { error: lhs.error };
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.EqualEqual || operatorToken.type == TokenType.NotEqual) {
    advance(context);

    const rhs = parseComparisonExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    const result: Result<EqualityExpression, ParserError> = {
      value: {
        kind: SyntaxKind.EqualityExpression,
        lhs: lhs.value!,
        operator: operatorToken.type == TokenType.EqualEqual ? BinaryOperator.EqualTo : BinaryOperator.NotEqualTo,
        rhs: rhs.value!
      }
    };

    return result;
  } else {
    return lhs;
  }
}

function parseComparisonExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseComparisonExpression.name);
  
  const lhs = parseAdditiveExpression(context);

  if (lhs.error != null) {
    return { error: lhs.error };
  }

  const operatorToken = peek(context);
  if (
    operatorToken.type == TokenType.GreaterThan ||
    operatorToken.type == TokenType.GreaterThanEqual ||
    operatorToken.type == TokenType.LessThan ||
    operatorToken.type == TokenType.LessThanEqual
  ) {
    advance(context);

    const rhs = parseAdditiveExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    let operator = BinaryOperator.GreaterThan;
    switch (operatorToken.type) {
      case TokenType.GreaterThan:
        operator = BinaryOperator.GreaterThan;
        break;

      case TokenType.GreaterThanEqual:
        operator = BinaryOperator.GreaterThanOrEqualTo;
        break;

      case TokenType.LessThan:
        operator = BinaryOperator.LessThan;
        break;

      case TokenType.LessThanEqual:
        operator = BinaryOperator.LessThanOrEqualTo;
        break;
    }

    const result: Result<ComparisonExpression, ParserError> = {
      value: {
        kind: SyntaxKind.ComparisonExpression,
        lhs: lhs.value!,
        operator,
        rhs: rhs.value!
      }
    };

    return result;
  } else {
    return lhs;
  }
}

function parseAdditiveExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseAdditiveExpression.name);
  
  const lhs = parseMultiplicativeExpression(context);

  if (lhs.error != null) {
    return { error: lhs.error };
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Plus || operatorToken.type == TokenType.Minus) {
    advance(context);

    const rhs = parseMultiplicativeExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    const result: Result<AdditiveExpression, ParserError> = {
      value: {
        kind: SyntaxKind.AdditiveExpression,
        lhs: lhs.value!,
        operator: operatorToken.type == TokenType.Plus ? BinaryOperator.Add : BinaryOperator.Subtract,
        rhs: rhs.value!
      }
    };

    return result;
  } else {
    return lhs;
  }
}

function parseMultiplicativeExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseMultiplicativeExpression.name);
  
  const lhs = parseUnaryExpression(context);

  if (lhs.error != null) {
    return { error: lhs.error };
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Multiply || operatorToken.type == TokenType.Divide) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    const result: Result<MultiplcativeExpression, ParserError> = {
      value: {
        kind: SyntaxKind.MultiplicativeExpression,
        lhs: lhs.value!,
        operator: operatorToken.type == TokenType.Multiply ? BinaryOperator.Multiply : BinaryOperator.Divide,
        rhs: rhs.value!
      }
    };

    return result;
  } else {
    return lhs;
  }
}

function parseUnaryExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseUnaryExpression.name);
  
  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Not || operatorToken.type == TokenType.Minus) {
    advance(context);

    const expression = parseUnaryExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    const result: Result<UnaryExpression, ParserError> = {
      value: {
        kind: SyntaxKind.UnaryExpression,
        operator: operatorToken.type == TokenType.Not ? UnaryOperator.LogicalNegate : UnaryOperator.Negate,
        expression: expression.value!
      }
    };

    return result;
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parsePrimaryExpression.name);
  
  let result: Result<Expression, ParserError>;
  const token = peek(context);
  
  switch (token.type) {
    case TokenType.OpenParen:
      result = parseParenthesizedExpression(context);
      break;

    case TokenType.Identifier:
      result = parseIdentifier(context);
      break;

    case TokenType.True:
    case TokenType.False:
      result = parseBoolLiteral(context);
      break;

    case TokenType.Integer:
      result = parseIntegerLiteral(context);
      break;

    case TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      return {
        error: createError(
          token,
          ParserErrorKind.UnknownExpression,
          `Token type ${TokenType[token.type]} unexpected in ${parseExpression.name}`
        ),
      };
  }

  return result;
}

function parseParenthesizedExpression(context: ParserContext): Result<ParenthesizedExpression, ParserError> {
  context.logger.enter(parseParenthesizedExpression.name);
  
  const openParenToken = expect(context, TokenType.OpenParen, parseParenthesizedExpression.name);
  
  if (openParenToken.error != null) {
    return { error: openParenToken.error };
  }

  advance(context);
  const expression = parseExpression(context);

  if (expression.error != null) {
    return { error: expression.error };
  }

  const closeParenToken = expect(context, TokenType.CloseParen, parseParenthesizedExpression.name);

  if (closeParenToken.error != null) {
    return { error: closeParenToken.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ParenthesizedExpression,
      expression: expression.value!
    }
  };
}

function parseCallExpression(context: ParserContext, expression: Expression): Result<CallExpression, ParserError> {
  context.logger.enter(parseCallExpression.name);
  let token = expect(context, TokenType.OpenParen, parseCallExpression.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const args = parseCallExpressionArguments(context);

  if (args.error != null) {
    return { error: token.error };
  }

  token = expect(context, TokenType.CloseParen, parseCallExpression.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.CallExpression,
      expression,
      arguments: args.value!,
    },
  };
}

function parseCallExpressionArguments(context: ParserContext): Result<Array<Expression>, ParserError> {
  context.logger.enter(parseCallExpressionArguments.name);
  const args: Array<Expression> = [];

  let token = peek(context);
  while (!isEOF(context) && token.type != TokenType.CloseParen) {
    token = peek(context);

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    args.push(expression.value!);
    token = peek(context);

    if (token.type == TokenType.Comma) {
      advance(context);
      token = peek(context);
    }
  }

  return {
    value: args,
  };
}

function parseTypeName(context: ParserContext): Result<TypeName, ParserError> {
  context.logger.enter(parseTypeName.name);
  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  return {
    value: {
      kind: SyntaxKind.TypeName,
      name: name.value!,
    },
  };
}

function parseIdentifier(context: ParserContext): Result<Identifier, ParserError> {
  context.logger.enter(parseIdentifier.name);
  const token = expect(context, TokenType.Identifier, parseIdentifier.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: token.value!.text!,
    },
  };
}

function parseBoolLiteral(context: ParserContext): Result<BoolLiteral, ParserError> {
  context.logger.enter(parseBoolLiteral.name);
  const token = expect(context, [ TokenType.True, TokenType.False ], parseBoolLiteral.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.BoolLiteral,
      value: token.value?.type == TokenType.True
    },
  };
}

function parseIntegerLiteral(context: ParserContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(parseIntegerLiteral.name);
  const token = expect(context, TokenType.Integer, parseIntegerLiteral.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.IntegerLiteral,
      value: <string>token.value?.text,
    },
  };
}

function parseStringLiteral(context: ParserContext): Result<StringLiteral, ParserError> {
  context.logger.enter(parseStringLiteral.name);
  const token = expect(context, TokenType.String, parseIntegerLiteral.name);

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StringLiteral,
      value: token.value!.text!,
    },
  };
}
