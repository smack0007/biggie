import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as ast from "./ast/mod.ts";
import * as scanner from "./scanner.ts";
import { bool, int, nameof } from "../shims.ts";

export interface ParserLogger {
  enter(name: string, fileName: string, token?: scanner.Token): void;
}

interface ParserContext {
  logger?: ParserLogger;
  entryFileName: string;
  sourceFiles: Record<string, ast.SourceFile>;
  diagnostics: ast.Diagnostic[];
}

interface ParserSourceFileContext {
  base: ParserContext;
  logger: {
    enter(name: string): void;
  };
  fileName: string;
  tokens: Array<scanner.Token>;
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

export interface ParserError extends ast.Diagnostic {
  kind: ParserErrorKind;
  fileName: string;
  pos: ast.TextPosition;
  message: string;
}

function resolveModule(filePath: string, basePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);
}

function parserError(
  fileName: string,
  token: scanner.Token,
  kind: ParserErrorKind,
  message: string,
): ParserError {
  return {
    kind,
    fileName,
    pos: token.pos,
    message,
  };
}

function getPos(context: ParserSourceFileContext): ast.TextPosition {
  return context.tokens[context.index].pos;
}

function advance(context: ParserSourceFileContext): scanner.Token {
  if (!isEOF(context)) {
    context.index += 1;
  }
  return peek(context);
}

function check(context: ParserSourceFileContext, type: scanner.TokenType): bool {
  if (isEOF(context)) {
    return false;
  }
  return peek(context).type == type;
}

function isEOF(context: ParserSourceFileContext): bool {
  if (context.index >= context.tokens.length) {
    return true;
  }
  return peek(context).type == scanner.TokenType.EOF;
}

function match(context: ParserSourceFileContext, types: Array<scanner.TokenType>): bool {
  for (const type of types) {
    if (check(context, type)) {
      advance(context);
      return true;
    }
  }
  return false;
}

function peek(context: ParserSourceFileContext): scanner.Token {
  return context.tokens[context.index < context.tokens.length ? context.index : context.tokens.length - 1];
}

function previous(context: ParserSourceFileContext): scanner.Token {
  const index = context.index > 0 ? context.index - 1 : 0;
  return context.tokens[index];
}

function next(context: ParserSourceFileContext): scanner.Token {
  const index = context.index + 1 < context.tokens.length ? context.index + 1 : context.tokens.length - 1;
  return context.tokens[index];
}

function expect(
  context: ParserSourceFileContext,
  expectedType: scanner.TokenType | scanner.TokenType[],
  functionName: string,
): scanner.Token {
  const token = peek(context);

  if (Array.isArray(expectedType)) {
    if (!expectedType.includes(token.type)) {
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${expectedType.map((x) => scanner.TokenType[x]).join(" | ")} but was ${
          scanner.TokenType[token.type]
        } at ${functionName}`,
      );
    }
  } else {
    if (token.type != expectedType) {
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${scanner.TokenType[expectedType]} but was ${
          scanner.TokenType[token.type]
        } (${token.text}) at ${functionName}`,
      );
    }
  }

  return token;
}

function resync(context: ParserSourceFileContext, tokenTypes: scanner.TokenType[]): void {
  let nextTokenType = peek(context).type;
  while (nextTokenType != scanner.TokenType.EOF && !tokenTypes.includes(nextTokenType)) {
    nextTokenType = advance(context).type;
  }
}

export async function parse(
  entryFileName: string,
  logger?: ParserLogger,
): Promise<ast.Program> {
  const context: ParserContext = {
    logger,
    entryFileName,
    sourceFiles: {},
    diagnostics: [],
  };

  context.sourceFiles[entryFileName] = await parseSourceFile(context, entryFileName);

  return {
    kind: ast.SyntaxKind.Program,
    startPos: { line: 0, column: 0 },
    endPos: { line: 0, column: 0 },
    entryFileName,
    sourceFiles: context.sourceFiles,
    diagnostics: context.diagnostics,
    bindState: ast.BindState.Uninitialized,
    locals: {},
  };
}

export async function parseSourceFile(
  baseContext: ParserContext,
  fileName: string,
): Promise<ast.SourceFile> {
  baseContext.logger?.enter(nameof(parseSourceFile), fileName);

  const tokens = scanner.scan(await fs.readFile(fileName, "utf8"));

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

  const statements: ast.Statement[] = [];

  while (!isEOF(context)) {
    try {
      statements.push(await parseTopLevelStatement(context));
    } catch (error) {
      context.base.diagnostics.push(<ast.Diagnostic> error);
      resync(context, TOP_LEVEL_STATEMENT_TOKEN_TYPES);
    }
  }

  expect(context, scanner.TokenType.EOF, nameof(parseSourceFile));

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.SourceFile,
    startPos,
    endPos,
    fileName,
    statements,
    bindState: ast.BindState.Uninitialized,
    exports: {},
    locals: {},
  };
}

const TOP_LEVEL_STATEMENT_TOKEN_TYPES: scanner.TokenType[] = [
  scanner.TokenType.Export,
  scanner.TokenType.Import,
  scanner.TokenType.Var,
  scanner.TokenType.Enum,
  scanner.TokenType.Func,
  scanner.TokenType.Struct,
];

async function parseTopLevelStatement(context: ParserSourceFileContext): Promise<ast.Statement> {
  context.logger.enter(nameof(parseTopLevelStatement));

  let isExported = false;
  if (peek(context).type == scanner.TokenType.Export) {
    isExported = true;
    advance(context);
  }

  let result: ast.Statement;
  const token = peek(context);
  switch (token.type) {
    case scanner.TokenType.Import:
      if (isExported) {
        throw parserError(
          context.fileName,
          token,
          ParserErrorKind.ExportImport,
          "export cannot be followed by import.",
        );
      }

      result = await parseImportDeclaration(context);
      break;

    case scanner.TokenType.Var:
      // TODO: export var?
      result = parseVarDeclaration(context);
      break;

    case scanner.TokenType.Enum:
      result = parseEnumDeclaration(context, { isExported });
      break;

    case scanner.TokenType.Func:
      result = parseFuncOrMethodDeclaration(context, { isExported });
      break;

    case scanner.TokenType.Struct:
      result = parseStructDeclaration(context, { isExported });
      break;

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownTopLevelStatement,
        `Token type ${scanner.TokenType[token.type]} unexpected in ${nameof(parseTopLevelStatement)}`,
      );
  }

  return result;
}

async function parseImportDeclaration(
  context: ParserSourceFileContext,
): Promise<ast.ImportDeclaration> {
  context.logger.enter(nameof(parseImportDeclaration));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Import, nameof(parseImportDeclaration));
  advance(context);

  let alias: ast.Identifier | undefined = undefined;
  if (peek(context).type == scanner.TokenType.Identifier) {
    alias = parseIdentifier(context);
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

  const resolvedFileName = resolveModule(module.value, path.dirname(context.fileName));
  context.base.sourceFiles[resolvedFileName] = await parseSourceFile(context.base, resolvedFileName);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ImportDeclaration,
    startPos,
    endPos,
    alias: alias,
    module: module,
    resolvedFileName,
    bindState: ast.BindState.Uninitialized,
  };
}

interface ParseVariableDeclarationOptions {
  skipInitializer?: bool;
  skipVarKeyword?: bool;
}

function parseVarDeclaration(
  context: ParserSourceFileContext,
  options: ParseVariableDeclarationOptions = {},
): ast.VarDeclaration {
  context.logger.enter(nameof(parseVarDeclaration));
  const startPos = getPos(context);

  if (!options.skipVarKeyword) {
    expect(context, scanner.TokenType.Var, nameof(parseVarDeclaration));
    advance(context);
  }

  const identifier = parseIdentifier(context);

  expect(context, scanner.TokenType.Colon, nameof(parseVarDeclaration));
  advance(context);

  const type = parseType(context);

  let initializer: ast.Expression | undefined = undefined;
  if (!options.skipInitializer) {
    if (check(context, scanner.TokenType.Equals)) {
      advance(context);
      initializer = parseExpression(context);
    }
  }

  if (!options.skipVarKeyword) {
    expect(context, scanner.TokenType.Semicolon, nameof(parseVarDeclaration));
    advance(context);
  }

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.VarDeclaration,
    startPos,
    endPos,
    name: identifier,
    type: type,
    initializer: initializer,
    bindState: ast.BindState.Uninitialized,
  };
}

interface ParseEnumDeclarationOptions {
  isExported?: bool;
}

function parseEnumDeclaration(
  context: ParserSourceFileContext,
  options: ParseEnumDeclarationOptions = {},
): ast.EnumDeclaration {
  context.logger.enter(nameof(parseEnumDeclaration));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Enum, nameof(parseEnumDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, scanner.TokenType.OpenBrace, nameof(parseEnumDeclaration));
  advance(context);

  const members: ast.EnumMember[] = [];
  while (check(context, scanner.TokenType.Identifier)) {
    members.push(parseEnumMember(context));

    if (peek(context).type == scanner.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, scanner.TokenType.CloseBrace, nameof(parseEnumDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.EnumDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    members,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseEnumMember(context: ParserSourceFileContext): ast.EnumMember {
  context.logger.enter(nameof(parseEnumMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  let initializer: ast.Expression | undefined = undefined;
  if (check(context, scanner.TokenType.Equals)) {
    advance(context);
    initializer = parseExpression(context);
  }

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.EnumMember,
    startPos,
    endPos,
    name,
    initializer,
    bindState: ast.BindState.Uninitialized,
  };
}

interface ParseFuncOrMethodDeclarationOptions {
  isExported?: bool;
}

function parseFuncOrMethodDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.FuncDeclaration | ast.MethodDeclaration {
  context.logger.enter(nameof(parseFuncOrMethodDeclaration));

  expect(context, scanner.TokenType.Func, nameof(parseFuncOrMethodDeclaration));

  if (next(context).type != scanner.TokenType.OpenParen) {
    return parseFuncDeclaration(context, options);
  }

  return parseMethodDeclaration(context, options);
}

function parseFuncDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.FuncDeclaration {
  context.logger.enter(nameof(parseFuncDeclaration));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Func, nameof(parseFuncDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseFuncDeclaration));
  advance(context);

  const args: ast.VarDeclaration[] = [];
  while (check(context, scanner.TokenType.Identifier)) {
    args.push(parseVarDeclaration(context, { skipVarKeyword: true }));

    if (peek(context).type == scanner.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, scanner.TokenType.CloseParen, nameof(parseFuncDeclaration));
  advance(context);

  // TODO: Should we just remove the colon before the return type?
  expect(context, scanner.TokenType.Colon, nameof(parseFuncDeclaration));
  advance(context);

  const returnType = parseType(context);

  const body = parseStatementBlock(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.FuncDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    arguments: args,
    returnType,
    body,
    bindState: ast.BindState.Uninitialized,
    locals: {},
  };
}

function parseMethodDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.MethodDeclaration {
  context.logger.enter(nameof(parseMethodDeclaration));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Func, nameof(parseMethodDeclaration));
  advance(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseMethodDeclaration));
  advance(context);

  const receiver = parseVarDeclaration(context, {
    skipVarKeyword: true,
    skipInitializer: true,
  });

  expect(context, scanner.TokenType.CloseParen, nameof(parseMethodDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseMethodDeclaration));
  advance(context);

  const args: ast.VarDeclaration[] = [];
  while (check(context, scanner.TokenType.Identifier)) {
    args.push(parseVarDeclaration(context, { skipVarKeyword: true }));

    if (peek(context).type == scanner.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, scanner.TokenType.CloseParen, nameof(parseMethodDeclaration));
  advance(context);

  // TODO: Should we just remove the colon before the return type?
  expect(context, scanner.TokenType.Colon, nameof(parseMethodDeclaration));
  advance(context);

  const returnType = parseType(context);

  const body = parseStatementBlock(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.MethodDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    receiver,
    name,
    arguments: args,
    returnType,
    body,
    bindState: ast.BindState.Uninitialized,
    locals: {},
  };
}

interface ParseStructDeclarationOptions {
  isExported?: bool;
}

function parseStructDeclaration(
  context: ParserSourceFileContext,
  options: ParseStructDeclarationOptions = {},
): ast.StructDeclaration {
  context.logger.enter(nameof(parseStructDeclaration));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Struct, nameof(parseStructDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, scanner.TokenType.OpenBrace, nameof(parseStructDeclaration));
  advance(context);

  const members: Array<ast.StructMember> = [];
  while (check(context, scanner.TokenType.Identifier)) {
    members.push(parseStructMember(context));
  }

  expect(context, scanner.TokenType.CloseBrace, nameof(parseStructDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StructDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    members,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseStructMember(context: ParserSourceFileContext): ast.StructMember {
  context.logger.enter(nameof(parseStructMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  expect(context, scanner.TokenType.Colon, nameof(parseStructMember));
  advance(context);

  const type = parseIdentifier(context);

  expect(context, scanner.TokenType.Semicolon, nameof(parseStructMember));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StructMember,
    startPos,
    endPos,
    name,
    type,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseStatementBlock(context: ParserSourceFileContext): ast.StatementBlock {
  context.logger.enter(nameof(parseStatementBlock));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenBrace, nameof(parseStatementBlock));
  advance(context);

  const statements: Array<ast.Statement> = [];
  while (!isEOF(context) && peek(context).type != scanner.TokenType.CloseBrace) {
    try {
      statements.push(parseBlockLevelStatement(context));
    } catch (error) {
      context.base.diagnostics.push(<ast.Diagnostic> error);
      resync(context, [scanner.TokenType.Semicolon, scanner.TokenType.CloseBrace]);

      // TODO: peek(context).type can be replaced with check
      if (peek(context).type == scanner.TokenType.Semicolon) {
        advance(context);
      }
    }
  }

  expect(context, scanner.TokenType.CloseBrace, nameof(parseStatementBlock));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StatementBlock,
    startPos,
    endPos,
    statements,
    bindState: ast.BindState.Uninitialized,
    locals: {},
  };
}

function parseBlockLevelStatement(context: ParserSourceFileContext): ast.Statement {
  context.logger.enter(nameof(parseBlockLevelStatement));
  const token = peek(context);

  let result: ast.Statement;
  switch (token.type) {
    case scanner.TokenType.Var:
      result = parseVarDeclaration(context);
      break;

    case scanner.TokenType.Defer:
      result = parseDeferStatement(context);
      break;

    case scanner.TokenType.If:
      result = parseIfStatement(context);
      break;

    case scanner.TokenType.While:
      result = parseWhileStatement(context);
      break;

    case scanner.TokenType.Return:
      result = parseReturnStatement(context);
      break;

    case scanner.TokenType.OpenBrace:
      result = parseStatementBlock(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return result;
}

function parseExpressionStatement(context: ParserSourceFileContext): ast.ExpressionStatement {
  context.logger.enter(nameof(parseExpressionStatement));
  const startPos = getPos(context);

  const expression = parseExpression(context);

  expect(context, scanner.TokenType.Semicolon, nameof(parseExpressionStatement));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ExpressionStatement,
    startPos,
    endPos,
    expression,
  };
}

function parseDeferStatement(context: ParserSourceFileContext): ast.DeferStatement {
  context.logger.enter(nameof(parseDeferStatement));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Defer, nameof(parseDeferStatement));
  advance(context);

  const body = parseBlockLevelStatement(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.DeferStatement,
    startPos,
    endPos,
    body,
  };
}

function parseIfStatement(context: ParserSourceFileContext): ast.IfStatement {
  context.logger.enter(nameof(parseIfStatement));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.If, nameof(parseIfStatement));
  advance(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseIfStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, scanner.TokenType.CloseParen, nameof(parseIfStatement));
  advance(context);

  const then = parseBlockLevelStatement(context);

  let _else: ast.Statement | undefined = undefined;

  // TODO: Can this be replaced with check?
  if (match(context, [scanner.TokenType.Else])) {
    _else = parseBlockLevelStatement(context);
  }

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.IfStatement,
    startPos,
    endPos,
    condition,
    then,
    else: _else,
  };
}

function parseWhileStatement(context: ParserSourceFileContext): ast.WhileStatement {
  context.logger.enter(nameof(parseWhileStatement));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.While, nameof(parseWhileStatement));
  advance(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseWhileStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, scanner.TokenType.CloseParen, nameof(parseWhileStatement));
  advance(context);

  const body = parseBlockLevelStatement(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.WhileStatement,
    startPos,
    endPos,
    condition,
    body,
  };
}

function parseReturnStatement(context: ParserSourceFileContext): ast.ReturnStatement {
  context.logger.enter(nameof(parseReturnStatement));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Return, nameof(parseReturnStatement));
  advance(context);

  const expression = parseExpression(context);

  expect(context, scanner.TokenType.Semicolon, nameof(parseReturnStatement));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ReturnStatement,
    startPos,
    endPos,
    expression,
  };
}

function parseExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseExpression));
  return parseAssignmentExpression(context);
}

const ASSIGNMENT_TOKENS = [
  scanner.TokenType.Equals,
  scanner.TokenType.PlusEquals,
  scanner.TokenType.MinusEquals,
  scanner.TokenType.AsteriskEquals,
  scanner.TokenType.SlashEquals,
];

const ASSIGNMENT_OPERATORS_MAP: Partial<Record<scanner.TokenType, ast.Operator>> = {
  [scanner.TokenType.Equals]: ast.Operator.Equals,
  [scanner.TokenType.PlusEquals]: ast.Operator.PlusEquals,
  [scanner.TokenType.MinusEquals]: ast.Operator.MinusEquals,
  [scanner.TokenType.AsteriskEquals]: ast.Operator.AsteriskEquals,
  [scanner.TokenType.SlashEquals]: ast.Operator.SlashEquals,
};

function parseAssignmentExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseAssignmentExpression));
  const startPos = getPos(context);

  const startToken = peek(context);
  const expression = parseLogicalOrExpression(context);

  if (match(context, ASSIGNMENT_TOKENS)) {
    const operatorToken = previous(context);
    const value = parseExpression(context);

    if (expression.kind != ast.SyntaxKind.Identifier) {
      throw parserError(
        context.fileName,
        startToken,
        ParserErrorKind.InvalidAssignmentTarget,
        "Invalid assignment target.",
      );
    }

    const endPos = getPos(context);

    return <ast.AssignmentExpression> {
      kind: ast.SyntaxKind.AssignmentExpression,
      startPos,
      endPos,
      name: <ast.Identifier> expression,
      operator: ASSIGNMENT_OPERATORS_MAP[operatorToken.type] as ast.AssignmentExpression["operator"],
      value,
    };
  } else {
    return expression;
  }
}

function parseLogicalOrExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseLogicalOrExpression));
  const startPos = getPos(context);

  let result = parseLogicalAndExpression(context);

  while (match(context, [scanner.TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    const endPos = getPos(context);

    result = <ast.LogicalExpression> {
      kind: ast.SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: ast.Operator.BarBar,
      rhs: rhs,
    };
  }

  return result;
}

function parseLogicalAndExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseLogicalAndExpression));
  const startPos = getPos(context);

  let result = parseEqualityExpression(context);

  while (match(context, [scanner.TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    const endPos = getPos(context);

    result = <ast.LogicalExpression> {
      kind: ast.SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: ast.Operator.AmpersandAmpersand,
      rhs,
    };
  }

  return result;
}

function parseEqualityExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseEqualityExpression));
  const startPos = getPos(context);

  let result = parseComparisonExpression(context);

  while (match(context, [scanner.TokenType.EqualsEquals, scanner.TokenType.ExclamationEquals])) {
    const operatorToken = previous(context);

    const rhs = parseComparisonExpression(context);

    const endPos = getPos(context);

    result = <ast.EqualityExpression> {
      kind: ast.SyntaxKind.EqualityExpression,
      startPos,
      endPos,
      lhs: result,
      operator: operatorToken.type == scanner.TokenType.EqualsEquals
        ? ast.Operator.EqualsEquals
        : ast.Operator.ExclamationEquals,
      rhs,
    };
  }

  return result;
}

function parseComparisonExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseComparisonExpression));
  const startPos = getPos(context);

  const lhs = parseAdditiveExpression(context);

  const operatorToken = peek(context);
  if (
    operatorToken.type == scanner.TokenType.GreaterThan ||
    operatorToken.type == scanner.TokenType.GreaterThanEqual ||
    operatorToken.type == scanner.TokenType.LessThan ||
    operatorToken.type == scanner.TokenType.LessThanEqual
  ) {
    advance(context);

    const rhs = parseAdditiveExpression(context);

    let operator = ast.Operator.GreaterThan;
    switch (operatorToken.type) {
      case scanner.TokenType.GreaterThan:
        operator = ast.Operator.GreaterThan;
        break;

      case scanner.TokenType.GreaterThanEqual:
        operator = ast.Operator.GreaterThanEquals;
        break;

      case scanner.TokenType.LessThan:
        operator = ast.Operator.LessThan;
        break;

      case scanner.TokenType.LessThanEqual:
        operator = ast.Operator.LessThanEquals;
        break;
    }

    const endPos = getPos(context);

    return <ast.ComparisonExpression> {
      kind: ast.SyntaxKind.ComparisonExpression,
      startPos,
      endPos,
      lhs,
      operator,
      rhs,
    };
  } else {
    return lhs;
  }
}

function parseAdditiveExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseAdditiveExpression));
  const startPos = getPos(context);

  const lhs = parseMultiplicativeExpression(context);

  // TODO: Use match here.
  const operatorToken = peek(context);
  if (operatorToken.type == scanner.TokenType.Plus || operatorToken.type == scanner.TokenType.Minus) {
    advance(context);

    const rhs = parseMultiplicativeExpression(context);

    const endPos = getPos(context);

    return <ast.AdditiveExpression> {
      kind: ast.SyntaxKind.AdditiveExpression,
      startPos,
      endPos,
      lhs,
      operator: operatorToken.type == scanner.TokenType.Plus ? ast.Operator.Plus : ast.Operator.Minus,
      rhs,
    };
  } else {
    return lhs;
  }
}

function parseMultiplicativeExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseMultiplicativeExpression));
  const startPos = getPos(context);

  const lhs = parseUnaryExpression(context);

  const operatorToken = peek(context);
  if (operatorToken.type == scanner.TokenType.Asterisk || operatorToken.type == scanner.TokenType.Slash) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    const endPos = getPos(context);

    return <ast.MultiplicativeExpression> {
      kind: ast.SyntaxKind.MultiplicativeExpression,
      startPos,
      endPos,
      lhs,
      operator: operatorToken.type == scanner.TokenType.Asterisk ? ast.Operator.Asterisk : ast.Operator.Slash,
      rhs,
    };
  } else {
    return lhs;
  }
}

// TODO: Implement this similar to parseAssignmentExpression.
function parseUnaryExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parseUnaryExpression));
  const startPos = getPos(context);

  const operatorToken = peek(context);
  if (
    operatorToken.type == scanner.TokenType.Ampersand ||
    operatorToken.type == scanner.TokenType.Asterisk ||
    operatorToken.type == scanner.TokenType.Exclamation ||
    operatorToken.type == scanner.TokenType.Minus
  ) {
    advance(context);

    const expression = parseUnaryExpression(context);

    let operator: ast.Operator = ast.Operator.Asterisk;
    switch (operatorToken.type) {
      case scanner.TokenType.Ampersand:
        operator = ast.Operator.Ampersand;
        break;

      case scanner.TokenType.Asterisk:
        operator = ast.Operator.Asterisk;
        break;

      case scanner.TokenType.Exclamation:
        operator = ast.Operator.Exclamation;
        break;

      case scanner.TokenType.Minus:
        operator = ast.Operator.Minus;
        break;
    }

    const endPos = getPos(context);

    return <ast.UnaryExpression> {
      kind: ast.SyntaxKind.UnaryExpression,
      startPos,
      endPos,
      operator,
      expression,
    };
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserSourceFileContext): ast.Expression {
  context.logger.enter(nameof(parsePrimaryExpression));

  let result: ast.Expression;
  let token = peek(context);

  switch (token.type) {
    case scanner.TokenType.Identifier:
      result = parseIdentifier(context);
      break;

    case scanner.TokenType.Integer:
      result = parseIntegerLiteral(context);
      break;

    case scanner.TokenType.OpenBrace:
      result = parseStructLiteral(context);
      break;

    case scanner.TokenType.OpenBracket:
      result = parseArrayLiteral(context);
      break;

    case scanner.TokenType.OpenParen:
      result = parseParenthesizedExpression(context);
      break;

    case scanner.TokenType.True:
    case scanner.TokenType.False:
      result = parseBooleanLiteral(context);
      break;

    case scanner.TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownExpression,
        `Token type ${scanner.TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
      );
  }

  // TODO: Use match here.
  token = peek(context);
  while ([scanner.TokenType.OpenParen, scanner.TokenType.OpenBracket, scanner.TokenType.Dot].includes(token.type)) {
    if (token.type == scanner.TokenType.OpenParen) {
      result = parseCallExpression(context, result);
    } else if (token.type == scanner.TokenType.OpenBracket) {
      result = parseElementAccessExpression(context, result);
    } else if (token.type == scanner.TokenType.Dot) {
      result = parsePropertyAccessExpression(context, result);
    }

    token = peek(context);
  }

  return result;
}

function parseParenthesizedExpression(context: ParserSourceFileContext): ast.ParenthesizedExpression {
  context.logger.enter(nameof(parseParenthesizedExpression));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseParenthesizedExpression));
  advance(context);

  const expression = parseExpression(context);

  expect(context, scanner.TokenType.CloseParen, nameof(parseParenthesizedExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ParenthesizedExpression,
    startPos,
    endPos,
    expression,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseCallExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.CallExpression {
  context.logger.enter(nameof(parseCallExpression));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenParen, nameof(parseCallExpression));
  advance(context);

  const args = parseCallExpressionArguments(context);

  expect(context, scanner.TokenType.CloseParen, nameof(parseCallExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.CallExpression,
    startPos,
    endPos,
    expression,
    arguments: args,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseElementAccessExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.ElementAccessExpression {
  context.logger.enter(nameof(parseElementAccessExpression));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenBracket, nameof(parseElementAccessExpression));
  advance(context);

  const argumentExpression = parseExpression(context);

  expect(context, scanner.TokenType.CloseBracket, nameof(parseElementAccessExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ElementAccessExpression,
    startPos,
    endPos,
    expression,
    argumentExpression,
    bindState: ast.BindState.Uninitialized,
  };
}

function parsePropertyAccessExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.PropertyAccessExpression {
  context.logger.enter(nameof(parsePropertyAccessExpression));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Dot, nameof(parsePropertyAccessExpression));
  advance(context);

  const name = parseIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.PropertyAccessExpression,
    startPos,
    endPos,
    expression,
    name,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseCallExpressionArguments(context: ParserSourceFileContext): ast.Expression[] {
  context.logger.enter(nameof(parseCallExpressionArguments));

  const args: Array<ast.Expression> = [];

  // TODO: Use check here.
  let token = peek(context);
  while (!isEOF(context) && token.type != scanner.TokenType.CloseParen) {
    args.push(parseExpression(context));

    token = peek(context);
    if (token.type == scanner.TokenType.Comma) {
      advance(context);
      token = peek(context);
    }
  }

  return args;
}

function parseType(context: ParserSourceFileContext): ast.TypeNode {
  context.logger.enter(nameof(parseType));

  const token = peek(context);
  if (token.type == scanner.TokenType.Asterisk) {
    return parsePointerType(context);
  } else if (token.type == scanner.TokenType.OpenBracket) {
    return parseArrayType(context);
  } else {
    return parseTypeReference(context);
  }
}

function parsePointerType(context: ParserSourceFileContext): ast.PointerType {
  context.logger.enter(nameof(parsePointerType));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.Asterisk, nameof(parsePointerType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.PointerType,
    startPos,
    endPos,
    elementType,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseArrayType(context: ParserSourceFileContext): ast.ArrayType {
  context.logger.enter(nameof(parseArrayType));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenBracket, nameof(parseArrayType));
  advance(context);

  expect(context, scanner.TokenType.CloseBracket, nameof(parseArrayType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ArrayType,
    startPos,
    endPos,
    elementType,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseTypeReference(context: ParserSourceFileContext): ast.TypeReference {
  context.logger.enter(nameof(parseTypeReference));
  const startPos = getPos(context);

  const typeName = parseQualifiedTypeOrIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.TypeReference,
    startPos,
    endPos,
    typeName,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseQualifiedTypeOrIdentifier(context: ParserSourceFileContext): ast.QualifiedName | ast.Identifier {
  context.logger.enter(nameof(parseQualifiedTypeOrIdentifier));
  const startPos = getPos(context);

  const left = parseIdentifier(context);

  let result: ast.QualifiedName | ast.Identifier = left;

  if (peek(context).type == scanner.TokenType.Dot) {
    advance(context);

    const right = parseIdentifier(context);

    const endPos = getPos(context);

    result = {
      kind: ast.SyntaxKind.QualifiedName,
      startPos,
      endPos,
      left: result,
      right: right,
      bindState: ast.BindState.Uninitialized,
    };
  }

  return result;
}

function parseIdentifier(context: ParserSourceFileContext): ast.Identifier {
  context.logger.enter(nameof(parseIdentifier));
  const startPos = getPos(context);

  const token = expect(context, scanner.TokenType.Identifier, nameof(parseIdentifier));

  if (token.text == null) {
    throw parserError(
      context.fileName,
      token,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIdentifier)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.Identifier,
    startPos,
    endPos,
    value: token.text,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseStructLiteral(context: ParserSourceFileContext): ast.StructLiteral {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenBrace, nameof(parseStructLiteral));
  advance(context);

  const elements: ast.StructLiteralElement[] = [];
  let token = peek(context);
  while (token.type != scanner.TokenType.CloseBrace) {
    const elementStartPos = getPos(context);

    if (elements.length > 0) {
      expect(context, scanner.TokenType.Comma, nameof(parseStructLiteral));
      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == scanner.TokenType.CloseBrace) {
        break;
      }
    }

    let name: ast.Identifier | undefined = undefined;
    if (peek(context).type == scanner.TokenType.Identifier) {
      const identifier = parseIdentifier(context);

      name = identifier;

      expect(context, scanner.TokenType.Colon, nameof(parseStructLiteral));
      advance(context);
    }

    const expression = parseExpression(context);

    const elementEndPos = getPos(context);

    elements.push({
      kind: ast.SyntaxKind.StructLiteralElement,
      startPos: elementStartPos,
      endPos: elementEndPos,
      name: name,
      expression: expression,
    });

    token = peek(context);
  }

  expect(context, scanner.TokenType.CloseBrace, nameof(parseStructLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StructLiteral,
    startPos,
    endPos,
    elements,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseArrayLiteral(context: ParserSourceFileContext): ast.ArrayLiteral {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

  expect(context, scanner.TokenType.OpenBracket, nameof(parseArrayLiteral));
  advance(context);

  const elements: ast.Expression[] = [];
  let token = peek(context);
  while (token.type != scanner.TokenType.CloseBracket) {
    if (elements.length > 0) {
      expect(context, scanner.TokenType.Comma, nameof(parseArrayLiteral));
      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == scanner.TokenType.CloseBracket) {
        break;
      }
    }

    elements.push(parseExpression(context));

    token = peek(context);
  }

  expect(context, scanner.TokenType.CloseBracket, nameof(parseArrayLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ArrayLiteral,
    startPos,
    endPos,
    elements,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseBooleanLiteral(context: ParserSourceFileContext): ast.BooleanLiteral {
  context.logger.enter(nameof(parseBooleanLiteral));
  const startPos = getPos(context);

  const token = expect(context, [scanner.TokenType.True, scanner.TokenType.False], nameof(parseBooleanLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.BooleanLiteral,
    startPos,
    endPos,
    value: token.type == scanner.TokenType.True,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseIntegerLiteral(context: ParserSourceFileContext): ast.IntegerLiteral {
  context.logger.enter(nameof(parseIntegerLiteral));
  const startPos = getPos(context);

  const token = expect(context, scanner.TokenType.Integer, nameof(parseIntegerLiteral));

  if (token.text == null) {
    throw parserError(
      context.fileName,
      token,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIntegerLiteral)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.IntegerLiteral,
    startPos,
    endPos,
    value: token.text,
    bindState: ast.BindState.Uninitialized,
  };
}

function parseStringLiteral(context: ParserSourceFileContext): ast.StringLiteral {
  context.logger.enter(nameof(parseStringLiteral));
  const startPos = getPos(context);

  const token = expect(context, scanner.TokenType.String, nameof(parseStringLiteral));

  if (token.text == null) {
    throw parserError(
      context.fileName,
      token,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseStringLiteral)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StringLiteral,
    startPos,
    endPos,
    value: token.text,
    bindState: ast.BindState.Uninitialized,
  };
}
