import {
  StatementBlock,
  FunctionDeclaration,
  Identifier,
  SourceFile,
  Statement,
  SyntaxKind,
  TypeName,
  Expression,
  ReturnStatement,
  ExpressionStatement,
  SyntaxTrivia,
  SyntaxNode,
  IntegerLiteral,
  StringLiteral,
  CallExpression,
} from "./ast";
import { Token, TokenType } from "./scanner";
import { bool, Result, int, OrNull } from "../shims";

export interface ParserLogger {
  enter: (name: string) => void;
}

interface ParserContext {
  fileName: string;
  tokens: Array<Token>;
  logger: ParserLogger;

  index: int;
}

export enum ParserErrorKind {
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

function createParserError(token: Token, kind: ParserErrorKind, message?: string): ParserError {
  return {
    kind,
    line: token.line,
    column: token.column,
    message,
  };
}

function getToken(context: ParserContext): Token {
  return context.tokens[context.index];
}

function peekNonTrivialToken(context: ParserContext): Token {
  let index = context.index;
  let token = context.tokens[index];

  while (token.type != TokenType.EOF && isTriviaTokenType(token.type)) {
    index += 1;
    token = context.tokens[index];
  }

  return token;
}

function exepectToken(
  context: ParserContext,
  expectedType: TokenType,
  functionName: string
): Result<Token, ParserError> {
  const token = getToken(context);

  if (token.type != expectedType) {
    return {
      error: createParserError(
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of Type ${TokenType[expectedType]} but was ${TokenType[token.type]} at ${functionName}`
      ),
    };
  }

  return { value: token };
}

function incrementToken(context: ParserContext): void {
  context.index++;
}

function isEOF(context: ParserContext): bool {
  if (context.index >= context.tokens.length) {
    return true;
  }

  return getToken(context).type == TokenType.EOF;
}

function isTriviaTokenType(type: TokenType): bool {
  return type == TokenType.Whitespace;
}

function parseTrivia(context: ParserContext): OrNull<SyntaxTrivia> {
  let token = getToken(context);

  let value = "";
  while (isTriviaTokenType(token.type)) {
    value += token.text ?? "";

    incrementToken(context);
    token = getToken(context);
  }

  if (value.length == 0) {
    return null;
  }

  return {
    value,
  };
}

function mergeLeadingTriviaIntoResult(
  result: Result<SyntaxNode, ParserError>,
  leadingTrivia: OrNull<SyntaxTrivia>
): Result<SyntaxNode, ParserError> {
  if (result.value == null) {
    return result;
  }

  return {
    value: {
      ...result.value,
      leadingTrivia,
    },
  };
}

function mergeTriviaIntoNode(
  node: SyntaxNode,
  leadingTrivia: OrNull<SyntaxTrivia>,
  trailingTrivia: OrNull<SyntaxTrivia>
): SyntaxNode {
  return {
    ...node,
    leadingTrivia,
    trailingTrivia,
  };
}

function mergeLeadingTriviaIntoNode(node: SyntaxNode, leadingTrivia: OrNull<SyntaxTrivia>): SyntaxNode {
  return {
    ...node,
    leadingTrivia,
  };
}

function mergeTrailingTriviaIntoNode(node: SyntaxNode, trailingTrivia: OrNull<SyntaxTrivia>): SyntaxNode {
  return {
    ...node,
    trailingTrivia,
  };
}

export function parse(
  fileName: string,
  tokens: Array<Token>,
  logger?: ParserLogger
): Result<SourceFile, ParserError> {
  const statements: Array<Statement> = [];

  const context: ParserContext = {
    fileName,
    tokens: tokens,
    logger: logger ?? {
      enter: () => {},
    },
    index: 0,
  };

  context.logger.enter(parse.name);

  while (!isEOF(context)) {
    const statement = parseTopLevelStatement(context);

    if (statement.error != null) {
      return { error: statement.error };
    }

    const trailingTrivia = parseTrivia(context);

    statements.push(mergeTrailingTriviaIntoNode(<Statement>statement.value, trailingTrivia));
  }

  const eof = exepectToken(context, TokenType.EOF, parse.name);

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
  const leadingTrivia = parseTrivia(context);
  const token = getToken(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Func:
      result = parseFunctionDeclaration(context);
      break;

    default:
      return {
        error: createParserError(
          token,
          ParserErrorKind.UnknownTopLevelStatement,
          `Token type ${TokenType[token.type]} unexpected in ${parseTopLevelStatement.name}`
        ),
      };
  }

  return mergeLeadingTriviaIntoResult(result, leadingTrivia);
}

function parseFunctionDeclaration(context: ParserContext): Result<FunctionDeclaration, ParserError> {
  context.logger.enter(parseFunctionDeclaration.name);
  const leadingTrivia = parseTrivia(context);
  let token = exepectToken(context, TokenType.Func, parseFunctionDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = exepectToken(context, TokenType.OpenParen, parseFunctionDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  // TODO: Function Args

  incrementToken(context);
  token = exepectToken(context, TokenType.CloseParen, parseFunctionDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);
  token = exepectToken(context, TokenType.Colon, parseFunctionDeclaration.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);
  const returnType = parseTypeName(context);

  incrementToken(context);
  const body = parseStatementBlock(context);

  if (body.error != null) {
    return { error: body.error };
  }

  return {
    value: {
      kind: SyntaxKind.FunctionDeclaration,
      body: <StatementBlock>body.value,
      name: <Identifier>identifier.value,
      returnType: <TypeName>returnType.value,
      leadingTrivia,
    },
  };
}

function parseStatementBlock(context: ParserContext): Result<StatementBlock, ParserError> {
  context.logger.enter(parseStatementBlock.name);
  const leadingTrivia = parseTrivia(context);
  let token = exepectToken(context, TokenType.OpenBrace, parseStatementBlock.name);

  if (token.error != null) {
    return { error: token.error };
  }

  const statements: Array<Statement> = [];

  incrementToken(context);
  while (!isEOF(context) && getToken(context).type != TokenType.CloseBrace) {
    const statement = parseBlockLevelStatement(context);

    if (statement.error) {
      return { error: statement.error };
    }

    const trailingTrivia = parseTrivia(context);

    statements.push(mergeTrailingTriviaIntoNode(<Statement>statement.value, trailingTrivia));
  }

  token = exepectToken(context, TokenType.CloseBrace, parseStatementBlock.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.StatementBlock,
      statements,
      leadingTrivia,
    },
  };
}

function parseBlockLevelStatement(context: ParserContext): Result<Statement, ParserError> {
  context.logger.enter(parseBlockLevelStatement.name);
  const leadingTrivia = parseTrivia(context);
  const token = getToken(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Return:
      result = parseReturnStatement(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return mergeLeadingTriviaIntoResult(result, leadingTrivia);
}

function parseExpressionStatement(context: ParserContext): Result<ExpressionStatement, ParserError> {
  context.logger.enter(parseExpressionStatement.name);
  const leadingTrivia = parseTrivia(context);
  const expression = parseExpression(context);

  if (expression.error != null) {
    return { error: expression.error };
  }

  const token = exepectToken(context, TokenType.EndStatement, parseExpressionStatement.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.ExpressionStatement,
      expression: <Expression>expression.value,
      leadingTrivia,
    },
  };
}

function parseReturnStatement(context: ParserContext): Result<ReturnStatement, ParserError> {
  context.logger.enter(parseReturnStatement.name);
  const leadingTrivia = parseTrivia(context);
  let token = exepectToken(context, TokenType.Return, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  incrementToken(context);
  const expression = parseExpression(context);

  if (expression.error) {
    return { error: expression.error };
  }

  exepectToken(context, TokenType.EndStatement, parseReturnStatement.name);

  if (token.error) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.ReturnStatement,
      expression: <Expression>expression.value,
      leadingTrivia,
    },
  };
}

function parseExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(parseExpression.name);
  const leadingTrivia = parseTrivia(context);
  let token = getToken(context);

  let result: Result<Expression, ParserError>;
  switch (token.type) {
    case TokenType.Identifier:
      result = parseIdentifier(context);
      break;

    case TokenType.Integer:
      result = parseIntegerLiteral(context);
      break;

    case TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      return {
        error: createParserError(
          token,
          ParserErrorKind.UnknownExpression,
          `Token type ${TokenType[token.type]} unexpected in ${parseExpression.name}`
        ),
      };
  }

  if (result.error == null) {
    token = peekNonTrivialToken(context);
    if (token.type == TokenType.OpenParen) {
      result = parseCallExpression(context, <Expression>result.value);
    }
  }

  return mergeLeadingTriviaIntoResult(result, leadingTrivia);
}

function parseCallExpression(context: ParserContext, expression: Expression): Result<CallExpression, ParserError> {
  context.logger.enter(parseCallExpression.name);
  const leadingTrivia = parseTrivia(context);
  let token = exepectToken(context, TokenType.OpenParen, parseCallExpression.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);
  const args = parseCallExpressionArguments(context);

  if (args.error != null) {
    return { error: token.error };
  }

  token = exepectToken(context, TokenType.CloseParen, parseCallExpression.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.CallExpression,
      expression,
      arguments: <Array<Expression>>args.value,
      leadingTrivia,
    },
  };
}

function parseCallExpressionArguments(context: ParserContext): Result<Array<Expression>, ParserError> {
  context.logger.enter(parseCallExpressionArguments.name);
  const args: Array<Expression> = [];

  let token = getToken(context);
  while (!isEOF(context) && token.type != TokenType.CloseParen) {
    const leadingTrivia = parseTrivia(context);
    token = getToken(context);

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    const trailingTrivia = parseTrivia(context);

    args.push(mergeTriviaIntoNode(<Expression>expression.value, leadingTrivia, trailingTrivia));
    token = getToken(context);

    if (token.type == TokenType.Comma) {
      incrementToken(context);
      token = getToken(context);
    }
  }

  return {
    value: args,
  };
}

function parseTypeName(context: ParserContext): Result<TypeName, ParserError> {
  context.logger.enter(parseTypeName.name);
  const leadingTrivia = parseTrivia(context);
  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  return {
    value: {
      kind: SyntaxKind.TypeName,
      name: <Identifier>name.value,
      leadingTrivia,
    },
  };
}

function parseIdentifier(context: ParserContext): Result<Identifier, ParserError> {
  context.logger.enter(parseIdentifier.name);
  const leadingTrivia = parseTrivia(context);
  const token = exepectToken(context, TokenType.Identifier, parseIdentifier.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: <string>token.value?.text,
      leadingTrivia,
    },
  };
}

function parseIntegerLiteral(context: ParserContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(parseIntegerLiteral.name);
  const leadingTrivia = parseTrivia(context);
  const token = exepectToken(context, TokenType.Integer, parseIntegerLiteral.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.IntegerLiteral,
      value: <string>token.value?.text,
      leadingTrivia,
    },
  };
}

function parseStringLiteral(context: ParserContext): Result<StringLiteral, ParserError> {
  context.logger.enter(parseStringLiteral.name);
  const leadingTrivia = parseTrivia(context);
  const token = exepectToken(context, TokenType.String, parseIntegerLiteral.name);

  if (token.error != null) {
    return { error: token.error };
  }

  incrementToken(context);

  return {
    value: {
      kind: SyntaxKind.StringLiteral,
      value: <string>token.value?.text,
      leadingTrivia,
    },
  };
}
