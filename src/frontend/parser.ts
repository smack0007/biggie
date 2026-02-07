import { dirname, isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { ErrorResult, Result, bool, error, int, isError, nameof, success } from "../shims.ts";
import {
  AdditiveExpression,
  ArrayLiteral,
  ArrayType,
  AssignmentExpression,
  BooleanLiteral,
  CallExpression,
  ComparisonExpression,
  DeferStatement,
  ElementAccessExpression,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FunctionArgument,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  ImportStatement,
  IntegerLiteral,
  LogicalExpression,
  MultiplicativeExpression,
  Operator,
  ParenthesizedExpression,
  PointerType,
  PropertyAccessExpression,
  QualifiedType,
  ReturnStatement,
  SourceFile,
  Statement,
  StatementBlock,
  StringLiteral,
  StructDeclaration,
  StructLiteral,
  StructLiteralElement,
  StructMember,
  SyntaxKind,
  TypeNode,
  TypeReference,
  UnaryExpression,
  VariableDeclaration,
  WhileStatement,
} from "./ast.ts";
import { scan, Token, TokenType } from "./scanner.ts";

export interface ParserLogger {
  enter(name: string, fileName: string, token?: Token): void;
}

interface ParserContext {
  entryFileName: string;
  logger?: ParserLogger;
  sourceFiles: Record<string, SourceFile>;
}

interface ParserSourceFileContext {
  base: ParserContext;
  logger: {
    enter(name: string): void;
  };
  fileName: string;
  tokens: Array<Token>;
  index: int;
}

export enum ParserErrorKind {
  InvalidAssignmentTarget,

  TokenTextIsNull,

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

function resolveModule(filePath: string, basePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
}

function parserError(token: Token, kind: ParserErrorKind, message?: string): ErrorResult<ParserError> {
  return error({
    kind,
    line: token.line,
    column: token.column,
    message,
  });
}

function advance(context: ParserSourceFileContext): Token {
  if (!isEOF(context)) {
    context.index += 1;
  }
  return previous(context);
}

function check(context: ParserSourceFileContext, type: TokenType): bool {
  if (isEOF(context)) {
    return false;
  }
  return peek(context).type == type;
}

function isEOF(context: ParserSourceFileContext): bool {
  if (context.index >= context.tokens.length) {
    return true;
  }
  return peek(context).type == TokenType.EOF;
}

function match(context: ParserSourceFileContext, types: Array<TokenType>): bool {
  for (const type of types) {
    if (check(context, type)) {
      advance(context);
      return true;
    }
  }
  return false;
}

function peek(context: ParserSourceFileContext): Token {
  return context.tokens[context.index < context.tokens.length ? context.index : context.tokens.length - 1];
}

function previous(context: ParserSourceFileContext): Token {
  const index = context.index > 0 ? context.index - 1 : 0;
  return context.tokens[index < context.tokens.length ? index : context.tokens.length - 1];
}

function expect(
  context: ParserSourceFileContext,
  expectedType: TokenType | TokenType[],
  functionName: string,
): Result<Token, ParserError> {
  const token = peek(context);

  if (Array.isArray(expectedType)) {
    if (!expectedType.includes(token.type)) {
      return parserError(
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${expectedType.map((x) => TokenType[x]).join(" | ")} but was ${
          TokenType[token.type]
        } at ${functionName}`,
      );
    }
  } else {
    if (token.type != expectedType) {
      return parserError(
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${TokenType[expectedType]} but was ${TokenType[token.type]} (${
          token.text
        }) at ${functionName}`,
      );
    }
  }

  return success(token);
}

export async function parse(
  entryFileName: string,
  logger?: ParserLogger,
): Promise<Result<Record<string, SourceFile>, ParserError>> {
  const context: ParserContext = {
    entryFileName,
    sourceFiles: {},
    logger,
  };

  const entrySourceFile = await parseSourceFile(context, entryFileName);

  if (isError(entrySourceFile)) {
    return entrySourceFile;
  }

  context.sourceFiles[entryFileName] = entrySourceFile.value;

  return success(context.sourceFiles);
}

export async function parseSourceFile(
  baseContext: ParserContext,
  fileName: string,
): Promise<Result<SourceFile, ParserError>> {
  baseContext.logger?.enter(nameof(parseSourceFile), fileName);

  const tokens = scan(await readFile(fileName, "utf8"));

  const context: ParserSourceFileContext = {
    base: baseContext,
    fileName,
    logger: {
      enter(name: string) {
        baseContext.logger?.enter(name, fileName, context.tokens[context.index]);
      },
    },
    tokens: tokens,
    index: 0,
  };

  const statements: Statement[] = [];

  while (!isEOF(context)) {
    const statement = await parseTopLevelStatement(context);

    if (isError(statement)) {
      return statement;
    }

    statements.push(statement.value);
  }

  const eof = expect(context, TokenType.EOF, nameof(parseSourceFile));

  if (isError(eof)) {
    return eof;
  }

  return success({
    kind: SyntaxKind.SourceFile,
    fileName,
    statements,
  });
}

async function parseTopLevelStatement(context: ParserSourceFileContext): Promise<Result<Statement, ParserError>> {
  context.logger.enter(nameof(parseTopLevelStatement));

  let isExported = false;
  if (peek(context).type == TokenType.Export) {
    isExported = true;
    advance(context);
  }

  let result: Result<Statement, ParserError>;
  const token = peek(context);
  switch (token.type) {
    case TokenType.Import:
      // TODO: export cannot be followed by import
      result = await parseImportStatement(context);
      break;

    case TokenType.Var:
      // TODO: export var?
      result = parseVariableDeclaration(context);
      break;

    case TokenType.Func:
      result = parseFunctionDeclaration(context, isExported);
      break;

    case TokenType.Struct:
      result = parseStructDeclaration(context, isExported);
      break;

    default:
      return parserError(
        token,
        ParserErrorKind.UnknownTopLevelStatement,
        `Token type ${TokenType[token.type]} unexpected in ${nameof(parseTopLevelStatement)}`,
      );
  }

  return result;
}

async function parseImportStatement(context: ParserSourceFileContext): Promise<Result<ImportStatement, ParserError>> {
  context.logger.enter(nameof(parseImportStatement));

  const token = expect(context, TokenType.Import, nameof(parseImportStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  let alias: Result<Identifier, ParserError> | undefined = undefined;
  if (peek(context).type == TokenType.Identifier) {
    alias = parseIdentifier(context);

    if (isError(alias)) {
      return alias;
    }
  }

  // TODO: Not sure if it should be done here or in a later phase but
  // we should probably check for imports that result in conflicting aliases
  // within the same file.
  // i.e.:
  // import "../v1/foo.big"
  // import "../v2/foo.big"

  const module = parseStringLiteral(context);

  if (isError(module)) {
    return module;
  }

  const fileName = resolveModule(module.value.value, dirname(context.fileName));
  const parseSourceFileResult = await parseSourceFile(context.base, fileName);

  if (isError(parseSourceFileResult)) {
    return parseSourceFileResult;
  }

  context.base.sourceFiles[fileName] = parseSourceFileResult.value;

  return success({
    kind: SyntaxKind.ImportStatement,
    module: module.value,
    alias: alias?.value,
    resolvedSourceFile: parseSourceFileResult.value,
  });
}

function parseVariableDeclaration(context: ParserSourceFileContext): Result<VariableDeclaration, ParserError> {
  context.logger.enter(nameof(parseVariableDeclaration));
  let token = expect(context, TokenType.Var, nameof(parseVariableDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (isError(identifier)) {
    return identifier;
  }

  token = expect(context, TokenType.Colon, nameof(parseVariableDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const type = parseType(context);

  if (isError(type)) {
    return type;
  }

  let expression: Result<Expression, ParserError> | undefined = undefined;

  if (check(context, TokenType.Equals)) {
    advance(context);
    expression = parseExpression(context);

    if (isError(expression)) {
      return expression;
    }
  }

  token = expect(context, TokenType.Semicolon, nameof(parseVariableDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.VariableDeclaration,
    name: identifier.value,
    type: type.value,
    expression: expression?.value,
  });
}

function parseFunctionDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): Result<FunctionDeclaration, ParserError> {
  context.logger.enter(nameof(parseFunctionDeclaration));
  let token = expect(context, TokenType.Func, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (isError(identifier)) {
    return identifier;
  }

  token = expect(context, TokenType.OpenParen, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const args: FunctionArgument[] = [];
  while (check(context, TokenType.Identifier)) {
    const arg = parseFunctionArgument(context);

    if (isError(arg)) {
      return arg;
    }

    args.push(arg.value);

    if (peek(context).type == TokenType.Comma) {
      advance(context);
    }
  }

  token = expect(context, TokenType.CloseParen, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  token = expect(context, TokenType.Colon, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const returnType = parseType(context);

  if (isError(returnType)) {
    return returnType;
  }

  const body = parseStatementBlock(context);

  if (isError(body)) {
    return body;
  }

  return success({
    kind: SyntaxKind.FuncDeclaration,
    isExported,
    body: body.value,
    name: identifier.value,
    arguments: args,
    returnType: returnType.value,
  });
}

function parseFunctionArgument(context: ParserSourceFileContext): Result<FunctionArgument, ParserError> {
  context.logger.enter(nameof(parseFunctionArgument));

  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  const token = expect(context, TokenType.Colon, nameof(parseFunctionArgument));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const type = parseType(context);

  if (isError(type)) {
    return type;
  }

  return success({
    kind: SyntaxKind.FuncArgument,
    name: name.value,
    type: type.value,
  });
}

function parseStructDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): Result<StructDeclaration, ParserError> {
  context.logger.enter(nameof(parseStructDeclaration));
  let token = expect(context, TokenType.Struct, nameof(parseStructDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (isError(identifier)) {
    return identifier;
  }

  token = expect(context, TokenType.OpenBrace, nameof(parseStructDeclaration));
  if (isError(token)) {
    return token;
  }

  advance(context);

  const members: Array<StructMember> = [];
  while (check(context, TokenType.Identifier)) {
    const member = parseStructMember(context);

    if (isError(member)) {
      return member;
    }

    members.push(<StructMember>member.value);
  }

  token = expect(context, TokenType.CloseBrace, nameof(parseStructDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.StructDeclaration,
    isExported,
    name: identifier.value,
    members: members,
  });
}

function parseStructMember(context: ParserSourceFileContext): Result<StructMember, ParserError> {
  context.logger.enter(nameof(parseStructMember));

  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  let token = expect(context, TokenType.Colon, nameof(parseStructMember));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const type = parseIdentifier(context);

  if (isError(type)) {
    return type;
  }

  token = expect(context, TokenType.Semicolon, nameof(parseStructMember));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.StructMember,
    name: name.value!,
    type: type.value!,
  });
}

function parseStatementBlock(context: ParserSourceFileContext): Result<StatementBlock, ParserError> {
  context.logger.enter(nameof(parseStatementBlock));
  let token = expect(context, TokenType.OpenBrace, nameof(parseStatementBlock));

  if (isError(token)) {
    return token;
  }

  const statements: Array<Statement> = [];

  advance(context);
  while (!isEOF(context) && peek(context).type != TokenType.CloseBrace) {
    const statement = parseBlockLevelStatement(context);

    if (isError(statement)) {
      return statement;
    }

    statements.push(statement.value!);
  }

  token = expect(context, TokenType.CloseBrace, nameof(parseStatementBlock));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.StatementBlock,
    statements,
  });
}

function parseBlockLevelStatement(context: ParserSourceFileContext): Result<Statement, ParserError> {
  context.logger.enter(nameof(parseBlockLevelStatement));
  const token = peek(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Var:
      result = parseVariableDeclaration(context);
      break;

    case TokenType.Defer:
      result = parseDeferStatement(context);
      break;

    case TokenType.If:
      result = parseIfStatement(context);
      break;

    case TokenType.While:
      result = parseWhileStatement(context);
      break;

    case TokenType.Return:
      result = parseReturnStatement(context);
      break;

    case TokenType.OpenBrace:
      result = parseStatementBlock(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return result;
}

function parseExpressionStatement(context: ParserSourceFileContext): Result<ExpressionStatement, ParserError> {
  context.logger.enter(nameof(parseExpressionStatement));
  const expression = parseExpression(context);

  if (isError(expression)) {
    return expression;
  }

  const token = expect(context, TokenType.Semicolon, nameof(parseExpressionStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.ExpressionStatement,
    expression: <Expression>expression.value,
  });
}

function parseDeferStatement(context: ParserSourceFileContext): Result<DeferStatement, ParserError> {
  context.logger.enter(nameof(parseDeferStatement));
  const token = expect(context, TokenType.Defer, nameof(parseDeferStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const body = parseBlockLevelStatement(context);

  if (isError(body)) {
    return body;
  }

  return success({
    kind: SyntaxKind.DeferStatement,
    body: body.value,
  });
}

function parseIfStatement(context: ParserSourceFileContext): Result<IfStatement, ParserError> {
  context.logger.enter(nameof(parseIfStatement));
  let token = expect(context, TokenType.If, nameof(parseIfStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  token = expect(context, TokenType.OpenParen, nameof(parseIfStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const condition = parseExpression(context);

  if (isError(condition)) {
    return condition;
  }

  token = expect(context, TokenType.CloseParen, nameof(parseIfStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const then = parseBlockLevelStatement(context);

  if (isError(then)) {
    return then;
  }

  let _else: Statement | undefined = undefined;

  if (match(context, [TokenType.Else])) {
    const elseResult = parseBlockLevelStatement(context);

    if (isError(elseResult)) {
      return elseResult;
    }

    _else = elseResult.value;
  }

  return success({
    kind: SyntaxKind.IfStatement,
    condition: condition.value,
    then: then.value,
    else: _else,
  });
}

function parseWhileStatement(context: ParserSourceFileContext): Result<WhileStatement, ParserError> {
  context.logger.enter(nameof(parseWhileStatement));
  let token = expect(context, TokenType.While, nameof(parseWhileStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);
  token = expect(context, TokenType.OpenParen, nameof(parseWhileStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const condition = parseExpression(context);

  if (isError(condition)) {
    return condition;
  }

  token = expect(context, TokenType.CloseParen, nameof(parseWhileStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const body = parseBlockLevelStatement(context);

  if (isError(body)) {
    return body;
  }

  return success({
    kind: SyntaxKind.WhileStatement,
    condition: condition.value!,
    body: body.value!,
  });
}

function parseReturnStatement(context: ParserSourceFileContext): Result<ReturnStatement, ParserError> {
  context.logger.enter(nameof(parseReturnStatement));
  const token = expect(context, TokenType.Return, nameof(parseReturnStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const expression = parseExpression(context);

  if (isError(expression)) {
    return expression;
  }

  expect(context, TokenType.Semicolon, nameof(parseReturnStatement));
  advance(context);

  return success({
    kind: SyntaxKind.ReturnStatement,
    expression: <Expression>expression.value,
  });
}

function parseExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseExpression));

  let result: Result<Expression, ParserError> = parseAssignmentExpression(context);

  if (isError(result)) {
    return result;
  }

  let token = peek(context);
  while ([TokenType.OpenParen, TokenType.OpenBracket, TokenType.Dot].includes(token.type)) {
    if (token.type == TokenType.OpenParen) {
      result = parseCallExpression(context, result.value);
    } else if (token.type == TokenType.OpenBracket) {
      result = parseElementAccessExpression(context, result.value);
    } else if (token.type == TokenType.Dot) {
      result = parsePropertyAccessExpression(context, result.value);
    }

    if (isError(result)) {
      return result;
    }

    token = peek(context);
  }

  return result;
}

const ASSIGNMENT_TOKENS = [
  TokenType.Equals,
  TokenType.PlusEquals,
  TokenType.MinusEquals,
  TokenType.AsteriskEquals,
  TokenType.SlashEquals,
];

const ASSIGNMENT_OPERATORS_MAP: Partial<Record<TokenType, Operator>> = {
  [TokenType.Equals]: Operator.Equals,
  [TokenType.PlusEquals]: Operator.PlusEquals,
  [TokenType.MinusEquals]: Operator.MinusEquals,
  [TokenType.AsteriskEquals]: Operator.AsteriskEquals,
  [TokenType.SlashEquals]: Operator.SlashEquals,
};

function parseAssignmentExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseAssignmentExpression));

  const startToken = peek(context);
  const expression = parseLogicalOrExpression(context);

  if (isError(expression)) {
    return expression;
  }

  if (match(context, ASSIGNMENT_TOKENS)) {
    const operatorToken = previous(context);
    const value = parseExpression(context);

    if (isError(value)) {
      return value;
    }

    if (expression.value.kind != SyntaxKind.Identifier) {
      return parserError(startToken, ParserErrorKind.InvalidAssignmentTarget, "Invalid assignment target.");
    }

    return success<AssignmentExpression>({
      kind: SyntaxKind.AssignmentExpression,
      name: expression.value as Identifier,
      operator: ASSIGNMENT_OPERATORS_MAP[operatorToken.type] as AssignmentExpression["operator"],
      value: value.value,
    });
  } else {
    return expression;
  }
}

function parseLogicalOrExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseLogicalOrExpression));

  let result = parseLogicalAndExpression(context);

  if (isError(result)) {
    return result;
  }

  while (match(context, [TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    result = success<LogicalExpression>({
      kind: SyntaxKind.LogicalExpression,
      lhs: result.value,
      operator: Operator.BarBar,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseLogicalAndExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseLogicalAndExpression));

  let result = parseEqualityExpression(context);

  if (isError(result)) {
    return result;
  }

  while (match(context, [TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    result = success<LogicalExpression>({
      kind: SyntaxKind.LogicalExpression,
      lhs: result.value,
      operator: Operator.AmpersandAmpersand,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseEqualityExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseEqualityExpression));

  let result = parseComparisonExpression(context);

  if (isError(result)) {
    return result;
  }

  while (match(context, [TokenType.EqualsEquals, TokenType.ExclamationEquals])) {
    const operatorToken = previous(context);

    const rhs = parseComparisonExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    result = success<EqualityExpression>({
      kind: SyntaxKind.EqualityExpression,
      lhs: result.value,
      operator: operatorToken.type == TokenType.EqualsEquals ? Operator.EqualsEquals : Operator.ExclamationEquals,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseComparisonExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseComparisonExpression));

  const lhs = parseAdditiveExpression(context);

  if (isError(lhs)) {
    return lhs;
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

    if (isError(rhs)) {
      return rhs;
    }

    let operator = Operator.GreaterThan;
    switch (operatorToken.type) {
      case TokenType.GreaterThan:
        operator = Operator.GreaterThan;
        break;

      case TokenType.GreaterThanEqual:
        operator = Operator.GreaterThanEquals;
        break;

      case TokenType.LessThan:
        operator = Operator.LessThan;
        break;

      case TokenType.LessThanEqual:
        operator = Operator.LessThanEquals;
        break;
    }

    return success<ComparisonExpression>({
      kind: SyntaxKind.ComparisonExpression,
      lhs: lhs.value,
      operator,
      rhs: rhs.value,
    });
  } else {
    return lhs;
  }
}

function parseAdditiveExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseAdditiveExpression));

  const lhs = parseMultiplicativeExpression(context);

  if (isError(lhs)) {
    return lhs;
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Plus || operatorToken.type == TokenType.Minus) {
    advance(context);

    const rhs = parseMultiplicativeExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    return success<AdditiveExpression>({
      kind: SyntaxKind.AdditiveExpression,
      lhs: lhs.value,
      operator: operatorToken.type == TokenType.Plus ? Operator.Plus : Operator.Minus,
      rhs: rhs.value,
    });
  } else {
    return lhs;
  }
}

function parseMultiplicativeExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseMultiplicativeExpression));

  const lhs = parseUnaryExpression(context);

  if (isError(lhs)) {
    return lhs;
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Asterisk || operatorToken.type == TokenType.Slash) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    return success<MultiplicativeExpression>({
      kind: SyntaxKind.MultiplicativeExpression,
      lhs: lhs.value,
      operator: operatorToken.type == TokenType.Asterisk ? Operator.Asterisk : Operator.Slash,
      rhs: rhs.value,
    });
  } else {
    return lhs;
  }
}

// TODO: Implement this similar to parseAssignmentExpression.
function parseUnaryExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseUnaryExpression));

  const operatorToken = peek(context);
  if (
    operatorToken.type == TokenType.Ampersand ||
    operatorToken.type == TokenType.Asterisk ||
    operatorToken.type == TokenType.Exclamation ||
    operatorToken.type == TokenType.Minus
  ) {
    advance(context);

    const expression = parseUnaryExpression(context);

    if (isError(expression)) {
      return expression;
    }

    let operator: Operator = Operator.Asterisk;
    switch (operatorToken.type) {
      case TokenType.Ampersand:
        operator = Operator.Ampersand;
        break;

      case TokenType.Asterisk:
        operator = Operator.Asterisk;
        break;

      case TokenType.Exclamation:
        operator = Operator.Exclamation;
        break;

      case TokenType.Minus:
        operator = Operator.Minus;
        break;
    }

    return success<UnaryExpression>({
      kind: SyntaxKind.UnaryExpression,
      operator,
      expression: expression.value,
    });
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parsePrimaryExpression));

  let result: Result<Expression, ParserError>;
  const token = peek(context);

  switch (token.type) {
    case TokenType.Identifier:
      result = parseIdentifier(context);
      break;

    case TokenType.Integer:
      result = parseIntegerLiteral(context);
      break;

    case TokenType.OpenBrace:
      result = parseStructLiteral(context);
      break;

    case TokenType.OpenBracket:
      result = parseArrayLiteral(context);
      break;

    case TokenType.OpenParen:
      result = parseParenthesizedExpression(context);
      break;

    case TokenType.True:
    case TokenType.False:
      result = parseBoolLiteral(context);
      break;

    case TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      return parserError(
        token,
        ParserErrorKind.UnknownExpression,
        `Token type ${TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
      );
  }

  return result;
}

function parseParenthesizedExpression(context: ParserSourceFileContext): Result<ParenthesizedExpression, ParserError> {
  context.logger.enter(nameof(parseParenthesizedExpression));

  const openParenToken = expect(context, TokenType.OpenParen, nameof(parseParenthesizedExpression));

  if (isError(openParenToken)) {
    return openParenToken;
  }

  advance(context);
  const expression = parseExpression(context);

  if (isError(expression)) {
    return expression;
  }

  const closeParenToken = expect(context, TokenType.CloseParen, nameof(parseParenthesizedExpression));

  if (isError(closeParenToken)) {
    return closeParenToken;
  }

  advance(context);

  return success({
    kind: SyntaxKind.ParenthesizedExpression,
    expression: expression.value,
  });
}

function parseCallExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<CallExpression, ParserError> {
  context.logger.enter(nameof(parseCallExpression));
  let token = expect(context, TokenType.OpenParen, nameof(parseCallExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const args = parseCallExpressionArguments(context);

  if (isError(args)) {
    return args;
  }

  token = expect(context, TokenType.CloseParen, nameof(parseCallExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.CallExpression,
    expression,
    arguments: args.value,
  });
}

function parseElementAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<ElementAccessExpression, ParserError> {
  context.logger.enter(nameof(parseElementAccessExpression));
  let token = expect(context, TokenType.OpenBracket, nameof(parseElementAccessExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const argumentExpression = parseExpression(context);

  if (isError(argumentExpression)) {
    return argumentExpression;
  }

  token = expect(context, TokenType.CloseBracket, nameof(parseElementAccessExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.ElementAccessExpression,
    expression,
    argumentExpression: argumentExpression.value,
  });
}

function parsePropertyAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<PropertyAccessExpression, ParserError> {
  context.logger.enter(nameof(parsePropertyAccessExpression));
  let token = expect(context, TokenType.Dot, nameof(parsePropertyAccessExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  return success({
    kind: SyntaxKind.PropertyAccessExpression,
    expression,
    name: name.value,
  });
}

function parseCallExpressionArguments(context: ParserSourceFileContext): Result<Array<Expression>, ParserError> {
  context.logger.enter(nameof(parseCallExpressionArguments));
  const args: Array<Expression> = [];

  let token = peek(context);
  while (!isEOF(context) && token.type != TokenType.CloseParen) {
    token = peek(context);

    const expression = parseExpression(context);

    if (isError(expression)) {
      return expression;
    }

    args.push(expression.value);
    token = peek(context);

    if (token.type == TokenType.Comma) {
      advance(context);
      token = peek(context);
    }
  }

  return success(args);
}

function parseType(context: ParserSourceFileContext): Result<TypeNode, ParserError> {
  context.logger.enter(nameof(parseType));

  const token = peek(context);
  if (token.type == TokenType.Asterisk) {
    return parsePointerType(context);
  } else if (token.type == TokenType.OpenBracket) {
    return parseArrayType(context);
  } else {
    return parseTypeReference(context);
  }
}

function parsePointerType(context: ParserSourceFileContext): Result<PointerType, ParserError> {
  context.logger.enter(nameof(parsePointerType));

  const expected = expect(context, TokenType.Asterisk, nameof(parsePointerType));

  if (isError(expected)) {
    return expected;
  }

  advance(context);

  const elementType = parseType(context);

  if (isError(elementType)) {
    return elementType;
  }

  return success({
    kind: SyntaxKind.PointerType,
    elementType: elementType.value,
  });
}

function parseArrayType(context: ParserSourceFileContext): Result<ArrayType, ParserError> {
  context.logger.enter(nameof(parseArrayType));

  let expected = expect(context, TokenType.OpenBracket, nameof(parseArrayType));

  if (isError(expected)) {
    return expected;
  }

  advance(context);
  expected = expect(context, TokenType.CloseBracket, nameof(parseArrayType));

  if (isError(expected)) {
    return expected;
  }

  advance(context);

  const elementType = parseType(context);

  if (isError(elementType)) {
    return elementType;
  }

  return success({
    kind: SyntaxKind.ArrayType,
    elementType: elementType.value,
  });
}

function parseTypeReference(context: ParserSourceFileContext): Result<TypeReference, ParserError> {
  context.logger.enter(nameof(parseTypeReference));

  const typeName = parseQualifiedTypeOrIdentifier(context);

  if (isError(typeName)) {
    return typeName;
  }

  return success({
    kind: SyntaxKind.TypeReference,
    typeName: typeName.value,
  });
}

function parseQualifiedTypeOrIdentifier(
  context: ParserSourceFileContext,
): Result<QualifiedType | Identifier, ParserError> {
  context.logger.enter(nameof(parseQualifiedTypeOrIdentifier));

  const left = parseIdentifier(context);

  if (isError(left)) {
    return left;
  }

  let result: QualifiedType | Identifier = left.value;

  if (peek(context).type == TokenType.Dot) {
    advance(context);
    const right = parseIdentifier(context);

    if (isError(right)) {
      return right;
    }

    result = {
      kind: SyntaxKind.QualifiedName,
      left: result,
      right: right.value,
    };
  }

  return success(result);
}

function parseIdentifier(context: ParserSourceFileContext): Result<Identifier, ParserError> {
  context.logger.enter(nameof(parseIdentifier));

  const token = expect(context, TokenType.Identifier, nameof(parseIdentifier));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIdentifier)}.`,
    );
  }

  advance(context);

  return success({
    kind: SyntaxKind.Identifier,
    value: token.value.text,
  });
}

function parseStructLiteral(context: ParserSourceFileContext): Result<StructLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));

  let expectedToken = expect(context, TokenType.OpenBrace, nameof(parseStructLiteral));

  if (isError(expectedToken)) {
    return expectedToken;
  }

  advance(context);

  const elements: StructLiteralElement[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBrace) {
    if (elements.length > 0) {
      expectedToken = expect(context, TokenType.Comma, nameof(parseStructLiteral));

      if (isError(expectedToken)) {
        return expectedToken;
      }

      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == TokenType.CloseBrace) {
        break;
      }
    }

    let name: Identifier | undefined = undefined;
    if (peek(context).type == TokenType.Identifier) {
      const identifier = parseIdentifier(context);

      if (isError(identifier)) {
        return identifier;
      }

      name = identifier.value;

      expectedToken = expect(context, TokenType.Colon, nameof(parseStructLiteral));

      if (isError(expectedToken)) {
        return expectedToken;
      }

      advance(context);
    }

    const expression = parseExpression(context);

    if (isError(expression)) {
      return expression;
    }

    elements.push({
      kind: SyntaxKind.StructLiteralElement,
      name: name,
      expression: expression.value,
    });

    token = peek(context);
  }

  expectedToken = expect(context, TokenType.CloseBrace, nameof(parseStructLiteral));

  if (isError(expectedToken)) {
    return expectedToken;
  }

  advance(context);

  return success({
    kind: SyntaxKind.StructLiteral,
    elements: elements,
  });
}

function parseArrayLiteral(context: ParserSourceFileContext): Result<ArrayLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));

  let expectedToken = expect(context, TokenType.OpenBracket, nameof(parseArrayLiteral));

  if (isError(expectedToken)) {
    return expectedToken;
  }

  advance(context);

  const elements: Expression[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBracket) {
    if (elements.length > 0) {
      expectedToken = expect(context, TokenType.Comma, nameof(parseArrayLiteral));

      if (isError(expectedToken)) {
        return expectedToken;
      }

      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == TokenType.CloseBracket) {
        break;
      }
    }

    const expression = parseExpression(context);

    if (isError(expression)) {
      return expression;
    }

    elements.push(expression.value);

    token = peek(context);
  }

  expectedToken = expect(context, TokenType.CloseBracket, nameof(parseArrayLiteral));

  if (isError(expectedToken)) {
    return expectedToken;
  }

  advance(context);

  return success({
    kind: SyntaxKind.ArrayLiteral,
    elements,
  });
}

function parseBoolLiteral(context: ParserSourceFileContext): Result<BooleanLiteral, ParserError> {
  context.logger.enter(nameof(parseBoolLiteral));
  const token = expect(context, [TokenType.True, TokenType.False], nameof(parseBoolLiteral));

  if (isError(token)) {
    return token;
  }

  advance(context);

  return success({
    kind: SyntaxKind.BooleanLiteral,
    value: token.value.type == TokenType.True,
  });
}

function parseIntegerLiteral(context: ParserSourceFileContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(nameof(parseIntegerLiteral));
  const token = expect(context, TokenType.Integer, nameof(parseIntegerLiteral));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIntegerLiteral)}.`,
    );
  }

  advance(context);

  return success({
    kind: SyntaxKind.IntegerLiteral,
    value: token.value.text,
  });
}

function parseStringLiteral(context: ParserSourceFileContext): Result<StringLiteral, ParserError> {
  context.logger.enter(nameof(parseStringLiteral));
  const token = expect(context, TokenType.String, nameof(parseStringLiteral));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseStringLiteral)}.`,
    );
  }

  advance(context);

  return success({
    kind: SyntaxKind.StringLiteral,
    value: token.value.text,
  });
}
