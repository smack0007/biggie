import { FunctionDeclaration, Identifier, SourceFile, Statement, SyntaxKind, TypeName } from "./ast";
import { Lexeme, LexemeType } from "./lexer";
import { Either, int } from "./shims";

interface ParserContext {
  fileName: string;
  lexemes: Array<Lexeme>;
  index: int;
}

enum ParserErrorKind {
  UnexpectedLexemeType,
  UnknownTopLevelStatement,
}

interface ParserError {
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

function expectLexeme(context: ParserContext, expectedType: LexemeType): Either<Lexeme, ParserError> {
  const lexeme = getLexeme(context);

  if (lexeme.type != expectedType) {
    return {
      error: createParserError(
        lexeme,
        ParserErrorKind.UnexpectedLexemeType,
        `Expected Lexeme of Type ${LexemeType[expectedType]} but was ${LexemeType[lexeme.type]}`
      ),
    };
  }

  return { value: lexeme };
}

function incrementLexeme(context: ParserContext): void {
  context.index++;
}

export function parse(fileName: string, lexemes: Array<Lexeme>): Either<SourceFile, ParserError> {
  const statements: Array<Statement> = [];

  const context: ParserContext = {
    fileName,
    lexemes,
    index: 0,
  };

  while (context.index < lexemes.length) {
    const statement = parseTopLevelStatement(context);

    if (statement.error != null) {
      return { error: statement.error };
    }

    statements.push(<Statement>statement.value);
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
  const lexeme = getLexeme(context);

  switch (lexeme.type) {
    case LexemeType.Func:
      return parseFunctionDeclaration(context);
  }

  return { error: createParserError(lexeme, ParserErrorKind.UnknownTopLevelStatement) };
}

function parseFunctionDeclaration(context: ParserContext): Either<FunctionDeclaration, ParserError> {
  let lexeme = expectLexeme(context, LexemeType.Func);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  incrementLexeme(context);
  lexeme = expectLexeme(context, LexemeType.OpenParen);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  // TODO: Function Args

  incrementLexeme(context);
  lexeme = expectLexeme(context, LexemeType.CloseParen);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  lexeme = expectLexeme(context, LexemeType.Colon);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  incrementLexeme(context);
  const returnType = parseType(context);

  return {
    value: {
      kind: SyntaxKind.FunctionDeclaration,
      name: <Identifier>identifier.value,
      returnType: <TypeName>returnType.value,
    },
  };
}

function parseIdentifier(context: ParserContext): Either<Identifier, ParserError> {
  const lexeme = expectLexeme(context, LexemeType.Identifier);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: <string>lexeme.value?.text,
    },
  };
}

function parseType(context: ParserContext): Either<TypeName, ParserError> {
  const lexeme = expectLexeme(context, LexemeType.Identifier);

  if (lexeme.error != null) {
    return { error: lexeme.error };
  }

  return {
    value: {
      kind: SyntaxKind.TypeName,
      value: <string>lexeme.value?.text,
    },
  };
}
