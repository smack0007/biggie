import { dirname, isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { bool, error, ErrorResult, int, isError, nameof, Result, success } from "../shims.ts";
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
  EnumDeclaration,
  EnumMember,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  ImportDeclaration,
  IntegerLiteral,
  LogicalExpression,
  MultiplicativeExpression,
  Operator,
  ParenthesizedExpression,
  PointerType,
  PropertyAccessExpression,
  QualifiedName,
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
import { scan, TextPosition, Token, TokenType } from "./scanner.ts";
import { Program } from "./program.ts";

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
  ExportImport,

  InvalidAssignmentTarget,

  TokenTextIsNull,

  UnexpectedTokenType,
  UnknownTopLevelStatement,
  UnknownBlockLevelStatement,
  UnknownExpression,
}

export interface ParserError {
  kind: ParserErrorKind;
  fileName: string;
  pos: TextPosition;
  message?: string;
}

function resolveModule(filePath: string, basePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
}

function parserError(
  fileName: string,
  token: Token,
  kind: ParserErrorKind,
  message?: string,
): ErrorResult<ParserError> {
  return error({
    kind,
    fileName,
    pos: token.pos,
    message,
  });
}

function getPos(context: ParserSourceFileContext): TextPosition {
  return context.tokens[context.index].pos;
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
        context.fileName,
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
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${TokenType[expectedType]} but was ${
          TokenType[token.type]
        } (${token.text}) at ${functionName}`,
      );
    }
  }

  return success(token);
}

export async function parse(
  entryFileName: string,
  logger?: ParserLogger,
): Promise<Result<Program, ParserError>> {
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

  return success({
    entryFileName,
    sourceFiles: context.sourceFiles,
  });
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

  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.SourceFile,
    startPos,
    endPos,
    fileName,
    statements,
    exports: {},
    locals: {},
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
      if (isExported) {
        return parserError(
          context.fileName,
          token,
          ParserErrorKind.ExportImport,
          "export cannot be followed by import.",
        );
      }

      result = await parseImportDeclaration(context);
      break;

    case TokenType.Var:
      // TODO: export var?
      result = parseVariableDeclaration(context);
      break;

    case TokenType.Enum:
      result = parseEnumDeclaration(context, isExported);
      break;

    case TokenType.Func:
      result = parseFunctionDeclaration(context, isExported);
      break;

    case TokenType.Struct:
      result = parseStructDeclaration(context, isExported);
      break;

    default:
      return parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownTopLevelStatement,
        `Token type ${TokenType[token.type]} unexpected in ${nameof(parseTopLevelStatement)}`,
      );
  }

  return result;
}

async function parseImportDeclaration(
  context: ParserSourceFileContext,
): Promise<Result<ImportDeclaration, ParserError>> {
  context.logger.enter(nameof(parseImportDeclaration));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Import, nameof(parseImportDeclaration));

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
  // or:
  // import foo "../v1/foo.big"
  // import foo "../v2/foo.big"

  const module = parseStringLiteral(context);

  if (isError(module)) {
    return module;
  }

  const resolvedFileName = resolveModule(module.value.value, dirname(context.fileName));
  const parseSourceFileResult = await parseSourceFile(context.base, resolvedFileName);

  if (isError(parseSourceFileResult)) {
    return parseSourceFileResult;
  }

  context.base.sourceFiles[resolvedFileName] = parseSourceFileResult.value;

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ImportDeclaration,
    startPos,
    endPos,
    alias: alias?.value,
    module: module.value,
    resolvedFileName,
  });
}

interface ParseVariableDeclarationOptions {
  isFunctionArgument?: bool;
}

function parseVariableDeclaration(
  context: ParserSourceFileContext,
  options: ParseVariableDeclarationOptions = {},
): Result<VariableDeclaration, ParserError> {
  context.logger.enter(nameof(parseVariableDeclaration));
  const startPos = getPos(context);

  let token: Result<Token, ParserError>;

  if (!options.isFunctionArgument) {
    token = expect(context, TokenType.Var, nameof(parseVariableDeclaration));

    if (isError(token)) {
      return token;
    }

    advance(context);
  }

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

  let initializer: Result<Expression, ParserError> | undefined = undefined;
  if (check(context, TokenType.Equals)) {
    advance(context);
    initializer = parseExpression(context);

    if (isError(initializer)) {
      return initializer;
    }
  }

  if (!options.isFunctionArgument) {
    token = expect(context, TokenType.Semicolon, nameof(parseVariableDeclaration));

    if (isError(token)) {
      return token;
    }

    advance(context);
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.VariableDeclaration,
    startPos,
    endPos,
    name: identifier.value,
    type: type.value,
    initializer: initializer?.value,
  });
}

// TODO: isExported should be moved into an options object like in parseVariableDeclaration.
function parseEnumDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): Result<EnumDeclaration, ParserError> {
  context.logger.enter(nameof(parseEnumDeclaration));
  const startPos = getPos(context);

  let token = expect(context, TokenType.Enum, nameof(parseEnumDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  token = expect(context, TokenType.OpenBrace, nameof(parseEnumDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const members: EnumMember[] = [];
  while (check(context, TokenType.Identifier)) {
    const member = parseEnumMember(context);

    if (isError(member)) {
      return member;
    }

    members.push(member.value);

    if (peek(context).type == TokenType.Comma) {
      advance(context);
    }
  }

  token = expect(context, TokenType.CloseBrace, nameof(parseEnumDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.EnumDeclaration,
    startPos,
    endPos,
    isExported,
    name: name.value,
    members,
  });
}

function parseEnumMember(context: ParserSourceFileContext): Result<EnumMember, ParserError> {
  context.logger.enter(nameof(parseEnumMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  let initializer: Result<Expression, ParserError> | undefined = undefined;
  if (check(context, TokenType.Equals)) {
    advance(context);
    initializer = parseExpression(context);

    if (isError(initializer)) {
      return initializer;
    }
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.EnumMember,
    startPos,
    endPos,
    name: name.value,
    initializer: initializer?.value,
  });
}

function parseFunctionDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): Result<FunctionDeclaration, ParserError> {
  context.logger.enter(nameof(parseFunctionDeclaration));
  const startPos = getPos(context);

  let token = expect(context, TokenType.Func, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  token = expect(context, TokenType.OpenParen, nameof(parseFunctionDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const args: VariableDeclaration[] = [];
  while (check(context, TokenType.Identifier)) {
    const arg = parseVariableDeclaration(context, { isFunctionArgument: true });

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.FunctionDeclaration,
    startPos,
    endPos,
    isExported,
    name: name.value,
    arguments: args,
    returnType: returnType.value,
    body: body.value,
  });
}

function parseStructDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): Result<StructDeclaration, ParserError> {
  context.logger.enter(nameof(parseStructDeclaration));
  const startPos = getPos(context);

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

    members.push(<StructMember> member.value);
  }

  token = expect(context, TokenType.CloseBrace, nameof(parseStructDeclaration));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.StructDeclaration,
    startPos,
    endPos,
    isExported,
    name: identifier.value,
    members: members,
  });
}

function parseStructMember(context: ParserSourceFileContext): Result<StructMember, ParserError> {
  context.logger.enter(nameof(parseStructMember));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.StructMember,
    startPos,
    endPos,
    name: name.value!,
    type: type.value!,
  });
}

function parseStatementBlock(context: ParserSourceFileContext): Result<StatementBlock, ParserError> {
  context.logger.enter(nameof(parseStatementBlock));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.StatementBlock,
    startPos,
    endPos,
    statements,
    locals: {},
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
  const startPos = getPos(context);

  const expression = parseExpression(context);

  if (isError(expression)) {
    return expression;
  }

  const token = expect(context, TokenType.Semicolon, nameof(parseExpressionStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ExpressionStatement,
    startPos,
    endPos,
    expression: <Expression> expression.value,
  });
}

function parseDeferStatement(context: ParserSourceFileContext): Result<DeferStatement, ParserError> {
  context.logger.enter(nameof(parseDeferStatement));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Defer, nameof(parseDeferStatement));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const body = parseBlockLevelStatement(context);

  if (isError(body)) {
    return body;
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.DeferStatement,
    startPos,
    endPos,
    body: body.value,
  });
}

function parseIfStatement(context: ParserSourceFileContext): Result<IfStatement, ParserError> {
  context.logger.enter(nameof(parseIfStatement));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.IfStatement,
    startPos,
    endPos,
    condition: condition.value,
    then: then.value,
    else: _else,
  });
}

function parseWhileStatement(context: ParserSourceFileContext): Result<WhileStatement, ParserError> {
  context.logger.enter(nameof(parseWhileStatement));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.WhileStatement,
    startPos,
    endPos,
    condition: condition.value!,
    body: body.value!,
  });
}

function parseReturnStatement(context: ParserSourceFileContext): Result<ReturnStatement, ParserError> {
  context.logger.enter(nameof(parseReturnStatement));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ReturnStatement,
    startPos,
    endPos,
    expression: <Expression> expression.value,
  });
}

function parseExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseExpression));
  return parseAssignmentExpression(context);
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
  const startPos = getPos(context);

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
      return parserError(
        context.fileName,
        startToken,
        ParserErrorKind.InvalidAssignmentTarget,
        "Invalid assignment target.",
      );
    }

    const endPos = getPos(context);

    return success<AssignmentExpression>({
      kind: SyntaxKind.AssignmentExpression,
      startPos,
      endPos,
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
  const startPos = getPos(context);

  let result = parseLogicalAndExpression(context);

  if (isError(result)) {
    return result;
  }

  while (match(context, [TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    const endPos = getPos(context);

    result = success<LogicalExpression>({
      kind: SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result.value,
      operator: Operator.BarBar,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseLogicalAndExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseLogicalAndExpression));
  const startPos = getPos(context);

  let result = parseEqualityExpression(context);

  if (isError(result)) {
    return result;
  }

  while (match(context, [TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    if (isError(rhs)) {
      return rhs;
    }

    const endPos = getPos(context);

    result = success<LogicalExpression>({
      kind: SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result.value,
      operator: Operator.AmpersandAmpersand,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseEqualityExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseEqualityExpression));
  const startPos = getPos(context);

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

    const endPos = getPos(context);

    result = success<EqualityExpression>({
      kind: SyntaxKind.EqualityExpression,
      startPos,
      endPos,
      lhs: result.value,
      operator: operatorToken.type == TokenType.EqualsEquals ? Operator.EqualsEquals : Operator.ExclamationEquals,
      rhs: rhs.value,
    });
  }

  return result;
}

function parseComparisonExpression(context: ParserSourceFileContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseComparisonExpression));
  const startPos = getPos(context);

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

    const endPos = getPos(context);

    return success<ComparisonExpression>({
      kind: SyntaxKind.ComparisonExpression,
      startPos,
      endPos,
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
  const startPos = getPos(context);

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

    const endPos = getPos(context);

    return success<AdditiveExpression>({
      kind: SyntaxKind.AdditiveExpression,
      startPos,
      endPos,
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
  const startPos = getPos(context);

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

    const endPos = getPos(context);

    return success<MultiplicativeExpression>({
      kind: SyntaxKind.MultiplicativeExpression,
      startPos,
      endPos,
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
  const startPos = getPos(context);

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

    const endPos = getPos(context);

    return success<UnaryExpression>({
      kind: SyntaxKind.UnaryExpression,
      startPos,
      endPos,
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
  let token = peek(context);

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
      result = parseBooleanLiteral(context);
      break;

    case TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      return parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownExpression,
        `Token type ${TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
      );
  }

  if (isError(result)) {
    return result;
  }

  token = peek(context);
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

function parseParenthesizedExpression(context: ParserSourceFileContext): Result<ParenthesizedExpression, ParserError> {
  context.logger.enter(nameof(parseParenthesizedExpression));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ParenthesizedExpression,
    startPos,
    endPos,
    expression: expression.value,
  });
}

function parseCallExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<CallExpression, ParserError> {
  context.logger.enter(nameof(parseCallExpression));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.CallExpression,
    startPos,
    endPos,
    expression,
    arguments: args.value,
  });
}

function parseElementAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<ElementAccessExpression, ParserError> {
  context.logger.enter(nameof(parseElementAccessExpression));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ElementAccessExpression,
    startPos,
    endPos,
    expression,
    argumentExpression: argumentExpression.value,
  });
}

function parsePropertyAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): Result<PropertyAccessExpression, ParserError> {
  context.logger.enter(nameof(parsePropertyAccessExpression));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Dot, nameof(parsePropertyAccessExpression));

  if (isError(token)) {
    return token;
  }

  advance(context);
  const name = parseIdentifier(context);

  if (isError(name)) {
    return name;
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.PropertyAccessExpression,
    startPos,
    endPos,
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
  const startPos = getPos(context);

  const expected = expect(context, TokenType.Asterisk, nameof(parsePointerType));

  if (isError(expected)) {
    return expected;
  }

  advance(context);

  const elementType = parseType(context);

  if (isError(elementType)) {
    return elementType;
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.PointerType,
    startPos,
    endPos,
    elementType: elementType.value,
  });
}

function parseArrayType(context: ParserSourceFileContext): Result<ArrayType, ParserError> {
  context.logger.enter(nameof(parseArrayType));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ArrayType,
    startPos,
    endPos,
    elementType: elementType.value,
  });
}

function parseTypeReference(context: ParserSourceFileContext): Result<TypeReference, ParserError> {
  context.logger.enter(nameof(parseTypeReference));
  const startPos = getPos(context);

  const typeName = parseQualifiedTypeOrIdentifier(context);

  if (isError(typeName)) {
    return typeName;
  }

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.TypeReference,
    startPos,
    endPos,
    typeName: typeName.value,
  });
}

function parseQualifiedTypeOrIdentifier(
  context: ParserSourceFileContext,
): Result<QualifiedName | Identifier, ParserError> {
  context.logger.enter(nameof(parseQualifiedTypeOrIdentifier));
  const startPos = getPos(context);

  const left = parseIdentifier(context);

  if (isError(left)) {
    return left;
  }

  let result: QualifiedName | Identifier = left.value;

  if (peek(context).type == TokenType.Dot) {
    advance(context);
    const right = parseIdentifier(context);

    if (isError(right)) {
      return right;
    }

    const endPos = getPos(context);

    result = {
      kind: SyntaxKind.QualifiedName,
      startPos,
      endPos,
      left: result,
      right: right.value,
    };
  }

  return success(result);
}

function parseIdentifier(context: ParserSourceFileContext): Result<Identifier, ParserError> {
  context.logger.enter(nameof(parseIdentifier));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Identifier, nameof(parseIdentifier));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      context.fileName,
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIdentifier)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.Identifier,
    startPos,
    endPos,
    value: token.value.text,
  });
}

function parseStructLiteral(context: ParserSourceFileContext): Result<StructLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

  let expectedToken = expect(context, TokenType.OpenBrace, nameof(parseStructLiteral));

  if (isError(expectedToken)) {
    return expectedToken;
  }

  advance(context);

  const elements: StructLiteralElement[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBrace) {
    const elementStartPos = getPos(context);

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

    const elementEndPos = getPos(context);

    elements.push({
      kind: SyntaxKind.StructLiteralElement,
      startPos: elementStartPos,
      endPos: elementEndPos,
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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.StructLiteral,
    startPos,
    endPos,
    elements: elements,
  });
}

function parseArrayLiteral(context: ParserSourceFileContext): Result<ArrayLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

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

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.ArrayLiteral,
    startPos,
    endPos,
    elements,
  });
}

function parseBooleanLiteral(context: ParserSourceFileContext): Result<BooleanLiteral, ParserError> {
  context.logger.enter(nameof(parseBooleanLiteral));
  const startPos = getPos(context);

  const token = expect(context, [TokenType.True, TokenType.False], nameof(parseBooleanLiteral));

  if (isError(token)) {
    return token;
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.BooleanLiteral,
    startPos,
    endPos,
    value: token.value.type == TokenType.True,
  });
}

function parseIntegerLiteral(context: ParserSourceFileContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(nameof(parseIntegerLiteral));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Integer, nameof(parseIntegerLiteral));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      context.fileName,
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIntegerLiteral)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.IntegerLiteral,
    startPos,
    endPos,
    value: token.value.text,
  });
}

function parseStringLiteral(context: ParserSourceFileContext): Result<StringLiteral, ParserError> {
  context.logger.enter(nameof(parseStringLiteral));
  const startPos = getPos(context);

  const token = expect(context, TokenType.String, nameof(parseStringLiteral));

  if (isError(token)) {
    return token;
  }

  if (token.value.text == null) {
    return parserError(
      context.fileName,
      token.value,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseStringLiteral)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return success({
    kind: SyntaxKind.StringLiteral,
    startPos,
    endPos,
    value: token.value.text,
  });
}
