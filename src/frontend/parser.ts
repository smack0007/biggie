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
import { Lexeme, LexemeType } from "./lexer";
import { bool, Result, int, OrNull } from "../shims";

export interface ParserLogger {
  enter: (name: string) => void;
}

interface ParserContext {
  fileName: string;
  lexemes: Array<Lexeme>;
  logger: ParserLogger;

  index: int;
}

export enum ParserErrorKind {
  UnexpectedLexemeType,
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

function createParserError(lexeme: Lexeme, kind: ParserErrorKind, message?: string): ParserError {
  return {
    kind,
    line: lexeme.line,
    column: lexeme.column,
    message,
  };
}

function getLexeme(context: ParserContext): Lexeme {
  return context.lexemes[context.index];
}

function peekNonTrivialLexeme(context: ParserContext): Lexeme {
  let index = context.index;
  let lexeme = context.lexemes[index];

  while (lexeme.type != LexemeType.EOF && isTriviaLexemeType(lexeme.type)) {
    index += 1;
    lexeme = context.lexemes[index];
  }

  return lexeme;
}

function expectLexeme(
  context: ParserContext,
  expectedType: LexemeType,
  functionName: string
): Result<Lexeme, ParserError> {
  const lexeme = getLexeme(context);

  if (lexeme.type != expectedType) {
    return {
      error: createParserError(
        lexeme,
        ParserErrorKind.UnexpectedLexemeType,
        `Expected Lexeme of Type ${LexemeType[expectedType]} but was ${LexemeType[lexeme.type]} at ${functionName}`
      ),
    };
  }

  return { value: lexeme };
}

function incrementLexeme(context: ParserContext): void {
  context.index++;
}

function isEOF(context: ParserContext): bool {
  if (context.index >= context.lexemes.length) {
    return true;
  }

  return getLexeme(context).type == LexemeType.EOF;
}

function isTriviaLexemeType(type: LexemeType): bool {
  return type == LexemeType.Whitespace;
}

function parseTrivia(context: ParserContext): OrNull<SyntaxTrivia> {
  let lexeme = getLexeme(context);

  let value = "";
  while (isTriviaLexemeType(lexeme.type)) {
    value += lexeme.text ?? "";

    incrementLexeme(context);
    lexeme = getLexeme(context);
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
  lexemes: Array<Lexeme>,
  logger?: ParserLogger
): Result<SourceFile, ParserError> {
  const statements: Array<Statement> = [];

  const context: ParserContext = {
    fileName,
    lexemes,
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

  const eof = expectLexeme(context, LexemeType.EOF, parse.name);

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
  const lexeme = getLexeme(context);

  let result: Result<Statement, ParserError>;
  switch (lexeme.type) {
    case LexemeType.Func:
      result = parseFunctionDeclaration(context);
      break;

    default:
      return {
        error: createParserError(
          lexeme,
          ParserErrorKind.UnknownTopLevelStatement,
          `Lexeme type ${LexemeType[lexeme.type]} unexpected in ${parseTopLevelStatement.name}`
        ),
      };
  }

  return mergeLeadingTriviaIntoResult(result, leadingTrivia);
}

function parseFunctionDeclaration(context: ParserContext): Result<FunctionDeclaration, ParserError> {
  context.logger.enter(parseFunctionDeclaration.name);
  const leadingTrivia = parseTrivia(context);
  let lexeme = expectLexeme(context, LexemeType.Func, parseFunctionDeclaration.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  lexeme = expectLexeme(context, LexemeType.OpenParen, parseFunctionDeclaration.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  // TODO: Function Args

  incrementLexeme(context);
  lexeme = expectLexeme(context, LexemeType.CloseParen, parseFunctionDeclaration.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  lexeme = expectLexeme(context, LexemeType.Colon, parseFunctionDeclaration.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const returnType = parseTypeName(context);

  incrementLexeme(context);
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
  let lexeme = expectLexeme(context, LexemeType.OpenBrace, parseStatementBlock.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  const statements: Array<Statement> = [];

  incrementLexeme(context);
  while (!isEOF(context) && getLexeme(context).type != LexemeType.CloseBrace) {
    const statement = parseBlockLevelStatement(context);

    if (statement.error) {
      return { error: statement.error };
    }

    const trailingTrivia = parseTrivia(context);

    statements.push(mergeTrailingTriviaIntoNode(<Statement>statement.value, trailingTrivia));
  }

  lexeme = expectLexeme(context, LexemeType.CloseBrace, parseStatementBlock.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

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
  const lexeme = getLexeme(context);

  let result: Result<Statement, ParserError>;
  switch (lexeme.type) {
    case LexemeType.Return:
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

  const lexeme = expectLexeme(context, LexemeType.EndStatement, parseExpressionStatement.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

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
  let lexeme = expectLexeme(context, LexemeType.Return, parseReturnStatement.name);

  if (lexeme.error) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const expression = parseExpression(context);

  if (expression.error) {
    return { error: expression.error };
  }

  expectLexeme(context, LexemeType.EndStatement, parseReturnStatement.name);

  if (lexeme.error) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

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
  let lexeme = getLexeme(context);

  let result: Result<Expression, ParserError>;
  switch (lexeme.type) {
    case LexemeType.Identifier:
      result = parseIdentifier(context);
      break;

    case LexemeType.Integer:
      result = parseIntegerLiteral(context);
      break;

    case LexemeType.String:
      result = parseStringLiteral(context);
      break;

    default:
      return {
        error: createParserError(
          lexeme,
          ParserErrorKind.UnknownExpression,
          `Lexeme type ${LexemeType[lexeme.type]} unexpected in ${parseExpression.name}`
        ),
      };
  }

  if (result.error == null) {
    lexeme = peekNonTrivialLexeme(context);
    if (lexeme.type == LexemeType.OpenParen) {
      result = parseCallExpression(context, <Expression>result.value);
    }
  }

  return mergeLeadingTriviaIntoResult(result, leadingTrivia);
}

function parseCallExpression(context: ParserContext, expression: Expression): Result<CallExpression, ParserError> {
  context.logger.enter(parseCallExpression.name);
  const leadingTrivia = parseTrivia(context);
  let lexeme = expectLexeme(context, LexemeType.OpenParen, parseCallExpression.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const args = parseCallExpressionArguments(context);

  if (args.error != null) {
    return { error: lexeme.error };
  }

  lexeme = expectLexeme(context, LexemeType.CloseParen, parseCallExpression.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

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

  let lexeme = getLexeme(context);
  while (!isEOF(context) && lexeme.type != LexemeType.CloseParen) {
    const leadingTrivia = parseTrivia(context);
    lexeme = getLexeme(context);

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    const trailingTrivia = parseTrivia(context);

    args.push(mergeTriviaIntoNode(<Expression>expression.value, leadingTrivia, trailingTrivia));
    lexeme = getLexeme(context);

    if (lexeme.type == LexemeType.Comma) {
      incrementLexeme(context);
      lexeme = getLexeme(context);
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
  const lexeme = expectLexeme(context, LexemeType.Identifier, parseIdentifier.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: <string>lexeme.value?.text,
      leadingTrivia,
    },
  };
}

function parseIntegerLiteral(context: ParserContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(parseIntegerLiteral.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = expectLexeme(context, LexemeType.Integer, parseIntegerLiteral.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

  return {
    value: {
      kind: SyntaxKind.IntegerLiteral,
      value: <string>lexeme.value?.text,
      leadingTrivia,
    },
  };
}

function parseStringLiteral(context: ParserContext): Result<StringLiteral, ParserError> {
  context.logger.enter(parseStringLiteral.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = expectLexeme(context, LexemeType.String, parseIntegerLiteral.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);

  return {
    value: {
      kind: SyntaxKind.StringLiteral,
      value: <string>lexeme.value?.text,
      leadingTrivia,
    },
  };
}
