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
} from "./ast";
import { Lexeme, LexemeType } from "./lexer";
import { Either, int, OrNull } from "./shims";

interface ParserContext {
  fileName: string;
  lexemes: Array<Lexeme>;
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

function expectLexeme(
  context: ParserContext,
  expectedType: LexemeType,
  functionName: string
): Either<Lexeme, ParserError> {
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

function isEOF(context: ParserContext): boolean {
  if (context.index >= context.lexemes.length) {
    return true;
  }

  return getLexeme(context).type == LexemeType.EOF;
}

function parseTrivia(context: ParserContext): OrNull<SyntaxTrivia> {
  let lexeme = getLexeme(context);

  let value = "";
  while (lexeme.type == LexemeType.Whitespace) {
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

function mergeLeadingTriviaIntoValue(
  result: Either<SyntaxNode, ParserError>,
  leadingTrivia: OrNull<SyntaxTrivia>
): Either<SyntaxNode, ParserError> {
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

function mergeTrailingTriviaIntoNode(node: SyntaxNode, trailingTrivia: OrNull<SyntaxTrivia>): SyntaxNode {
  return {
    ...node,
    trailingTrivia,
  };
}

export function parse(fileName: string, lexemes: Array<Lexeme>): Either<SourceFile, ParserError> {
  console.info(parse.name);

  const statements: Array<Statement> = [];

  const context: ParserContext = {
    fileName,
    lexemes,
    index: 0,
  };

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

function parseTopLevelStatement(context: ParserContext): Either<Statement, ParserError> {
  console.info(parseTopLevelStatement.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = getLexeme(context);

  let result: Either<Statement, ParserError>;
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

  return mergeLeadingTriviaIntoValue(result, leadingTrivia);
}

function parseFunctionDeclaration(context: ParserContext): Either<FunctionDeclaration, ParserError> {
  console.info(parseFunctionDeclaration.name);
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

  incrementLexeme(context);
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

function parseStatementBlock(context: ParserContext): Either<StatementBlock, ParserError> {
  console.info(parseStatementBlock.name);
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

function parseBlockLevelStatement(context: ParserContext): Either<Statement, ParserError> {
  console.info(parseBlockLevelStatement.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = getLexeme(context);

  let result: Either<Statement, ParserError>;
  switch (lexeme.type) {
    case LexemeType.Return:
      result = parseReturnStatement(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return mergeLeadingTriviaIntoValue(result, leadingTrivia);
}

function parseExpressionStatement(context: ParserContext): Either<ExpressionStatement, ParserError> {
  console.info(parseExpressionStatement.name);
  const leadingTrivia = parseTrivia(context);
  const expression = parseExpression(context);

  const lexeme = expectLexeme(context, LexemeType.EndStatement, parseExpressionStatement.name);

  if (lexeme.error) {
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

function parseReturnStatement(context: ParserContext): Either<ReturnStatement, ParserError> {
  console.info(parseReturnStatement.name);
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

function parseExpression(context: ParserContext): Either<Expression, ParserError> {
  console.info(parseExpression.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = getLexeme(context);

  let result: Either<Expression, ParserError>;
  switch (lexeme.type) {
    case LexemeType.Integer:
      result = parseIntegerLiteral(context);
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

  return mergeLeadingTriviaIntoValue(result, leadingTrivia);
}

function parseTypeName(context: ParserContext): Either<TypeName, ParserError> {
  console.info(parseTypeName.name);
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

function parseIdentifier(context: ParserContext): Either<Identifier, ParserError> {
  console.info(parseIdentifier.name);
  const leadingTrivia = parseTrivia(context);
  const lexeme = expectLexeme(context, LexemeType.Identifier, parseIdentifier.name);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: <string>lexeme.value?.text,
      leadingTrivia,
    },
  };
}

function parseIntegerLiteral(context: ParserContext): Either<IntegerLiteral, ParserError> {
  console.info(parseIntegerLiteral.name);
  const leadingTrivia = parseTrivia(context);
  const integer = expectLexeme(context, LexemeType.Integer, parseIntegerLiteral.name);

  if (integer.error != null) {
    return { error: integer.error };
  }

  incrementLexeme(context);

  return {
    value: {
      kind: SyntaxKind.IntegerLiteral,
      value: <string>integer.value?.text,
      leadingTrivia,
    },
  };
}
