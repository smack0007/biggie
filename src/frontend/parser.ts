import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as ast from "../ast/mod.ts";
import * as scanner from "./scanner.ts";
import { bool, int, nameof } from "../shims.ts";
import { nameofSyntaxKind } from "../ast/nameof.ts";

interface ParserContext {
  entryFileName: string;

  log: (message: string) => void;
  scan: (fileName: string) => Promise<ast.Token[]>;

  sourceFiles: Record<string, ast.SourceFile>;
  diagnostics: ast.Diagnostic[];
}

interface ParserSourceFileContext {
  base: ParserContext;
  fileName: string;
  tokens: Array<ast.Token>;
  index: int;
}

export enum ParserErrorKind {
  InvalidAssignmentTarget,
  InvalidExportStatement,
  InvalidExternStatement,
  InvalidStructLiteral,

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
  token: ast.Token,
  kind: ParserErrorKind,
  message: string,
): ParserError {
  return {
    category: ast.DiagnosticCategory.Error,
    kind,
    fileName,
    pos: token.pos,
    message,
  };
}

function getPos(context: ParserSourceFileContext): ast.TextPosition {
  return context.tokens[context.index].pos;
}

function advance(context: ParserSourceFileContext): ast.Token {
  if (!isEOF(context)) {
    context.index += 1;
  }
  return peek(context);
}

function check(context: ParserSourceFileContext, type: ast.TokenType): bool {
  if (isEOF(context)) {
    return false;
  }
  return peek(context).type == type;
}

function isEOF(context: ParserSourceFileContext): bool {
  if (context.index >= context.tokens.length) {
    return true;
  }
  return peek(context).type == ast.TokenType.EOF;
}

function match(context: ParserSourceFileContext, types: Array<ast.TokenType>): bool {
  for (const type of types) {
    if (check(context, type)) {
      advance(context);
      return true;
    }
  }
  return false;
}

function peek(context: ParserSourceFileContext): ast.Token {
  return context.tokens[context.index < context.tokens.length ? context.index : context.tokens.length - 1];
}

function previous(context: ParserSourceFileContext): ast.Token {
  const index = context.index > 0 ? context.index - 1 : 0;
  return context.tokens[index];
}

function next(context: ParserSourceFileContext): ast.Token {
  const index = context.index + 1 < context.tokens.length ? context.index + 1 : context.tokens.length - 1;
  return context.tokens[index];
}

// TODO: Split this out into expect and expectAny.
function expect(
  context: ParserSourceFileContext,
  expectedType: ast.TokenType | ast.TokenType[],
  functionName: string,
): ast.Token {
  const token = peek(context);

  if (Array.isArray(expectedType)) {
    if (!expectedType.includes(token.type)) {
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${expectedType.map((x) => ast.TokenType[x]).join(" | ")} but was ${
          ast.TokenType[token.type]
        } at ${functionName}`,
      );
    }
  } else {
    if (token.type != expectedType) {
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${ast.TokenType[expectedType]} but was ${
          ast.TokenType[token.type]
        } (${token.text}) at ${functionName}`,
      );
    }
  }

  return token;
}

function resync(context: ParserSourceFileContext, tokenTypes: ast.TokenType[]): void {
  let nextTokenType = peek(context).type;
  while (nextTokenType != ast.TokenType.EOF && !tokenTypes.includes(nextTokenType)) {
    nextTokenType = advance(context).type;
  }
}

export interface ParseOptions {
  log?: (message: string) => void;
  scan?: (fileName: string) => Promise<ast.Token[]>;
}

export async function parse(
  entryFileName: string,
  options: ParseOptions = {},
): Promise<ast.Program> {
  const context: ParserContext = {
    entryFileName,

    log: options.log ?? (() => {}),
    scan: options.scan ?? (async (fileName: string) => scanner.scan(await fs.readFile(fileName, "utf8"))),

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
    locals: {},
    nextSymbolScope: null,
  };
}

export async function parseSourceFile(
  context: ParserContext,
  fileName: string,
): Promise<ast.SourceFile> {
  context.log(`[${fileName}] ${nameof(parseSourceFile)}`);

  const tokens = await context.scan(fileName);

  const sourceFileContext: ParserSourceFileContext = {
    base: context,
    fileName,
    tokens: tokens,
    index: 0,
  };

  const startPos = getPos(sourceFileContext);

  const statements: ast.Statement[] = [];

  while (!isEOF(sourceFileContext)) {
    try {
      statements.push(await parseTopLevelStatement(sourceFileContext));
    } catch (error) {
      sourceFileContext.base.diagnostics.push(<ast.Diagnostic> error);
      resync(sourceFileContext, TOP_LEVEL_STATEMENT_TOKEN_TYPES);
    }
  }

  expect(sourceFileContext, ast.TokenType.EOF, nameof(parseSourceFile));

  const endPos = getPos(sourceFileContext);

  return {
    kind: ast.SyntaxKind.SourceFile,
    startPos,
    endPos,
    fileName,
    statements,
    exports: {},
    locals: {},
    nextSymbolScope: null,
    bindState: ast.BindState.Uninitialized,
  };
}

function logEnter(context: ParserSourceFileContext, funcName: string): void {
  context.base.log(`[${context.fileName}] ${funcName}`);
}

const TOP_LEVEL_STATEMENT_TOKEN_TYPES: ast.TokenType[] = [
  ast.TokenType.Export,
  ast.TokenType.Extern,
  ast.TokenType.Import,
  ast.TokenType.Var,
  ast.TokenType.Enum,
  ast.TokenType.Func,
  ast.TokenType.Struct,
];

async function parseTopLevelStatement(context: ParserSourceFileContext): Promise<ast.Statement> {
  logEnter(context, nameof(parseTopLevelStatement));

  const token = peek(context);
  switch (token.type) {
    case ast.TokenType.Enum:
      return parseEnumDeclaration(context);

    case ast.TokenType.Export:
      return parseExportStatement(context);

    case ast.TokenType.Extern:
      return parseExternStatement(context);

    case ast.TokenType.Func:
      return parseFuncOrMethodDeclaration(context);

    case ast.TokenType.Import:
      return await parseImportDeclaration(context);

    case ast.TokenType.Struct:
      return parseStructDeclaration(context);

    case ast.TokenType.Var:
      return parseVarDeclaration(context);

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownTopLevelStatement,
        `Token type ${ast.TokenType[token.type]} unexpected in ${nameof(parseTopLevelStatement)}`,
      );
  }
}

function parseExportStatement(
  context: ParserSourceFileContext,
): ast.Statement {
  logEnter(context, nameof(parseExportStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Export, nameof(parseExportStatement));
  advance(context);

  let result: ast.Exportable = undefined!;
  const token = peek(context);
  switch (token.type) {
    case ast.TokenType.Enum:
      result = parseEnumDeclaration(context);
      break;

    case ast.TokenType.Func:
      result = parseFuncOrMethodDeclaration(context);
      break;

    case ast.TokenType.Struct:
      result = parseStructDeclaration(context);
      break;

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.InvalidExportStatement,
        `Token type ${ast.TokenType[token.type]} unexpected in ${nameof(parseExportStatement)}`,
      );
  }

  const endPos = getPos(context);

  result.isExported = true;
  result.startPos = startPos;
  result.endPos = endPos;

  return result;
}

function parseExternStatement(
  context: ParserSourceFileContext,
): ast.Statement {
  logEnter(context, nameof(parseExternStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Extern, nameof(parseExternStatement));
  advance(context);

  let result: ast.Statement = ast.makeNoOpStatement();
  const token = peek(context);
  switch (token.type) {
    case ast.TokenType.Func:
      {
        const funcDeclaration = parseFuncDeclaration(context, { excludeBody: true });

        expect(context, ast.TokenType.Semicolon, nameof(parseExternStatement));
        advance(context);

        result = <ast.ExternFuncDeclaration> {
          kind: ast.SyntaxKind.ExternFuncDeclaration,
          name: funcDeclaration.name,
          args: funcDeclaration.args,
          returnType: funcDeclaration.returnType,
        };
      }
      break;

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.InvalidExternStatement,
        `Token type ${ast.TokenType[token.type]} unexpected in ${nameof(parseExternStatement)}`,
      );
  }

  const endPos = getPos(context);

  result.startPos = startPos;
  result.endPos = endPos;

  return result;
}

async function parseImportDeclaration(
  context: ParserSourceFileContext,
): Promise<ast.ImportDeclaration> {
  logEnter(context, nameof(parseImportDeclaration));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Import, nameof(parseImportDeclaration));
  advance(context);

  let alias: ast.Identifier | undefined = undefined;
  if (peek(context).type == ast.TokenType.Identifier) {
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
    symbol: null,
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
  logEnter(context, nameof(parseVarDeclaration));
  const startPos = getPos(context);

  if (!options.skipVarKeyword) {
    expect(context, ast.TokenType.Var, nameof(parseVarDeclaration));
    advance(context);
  }

  const identifier = parseIdentifier(context);

  expect(context, ast.TokenType.Colon, nameof(parseVarDeclaration));
  advance(context);

  const type = parseType(context);

  let initializer: ast.Expression | undefined = undefined;
  if (!options.skipInitializer) {
    if (check(context, ast.TokenType.Equals)) {
      advance(context);
      initializer = parseExpression(context);
    }
  }

  if (!options.skipVarKeyword) {
    expect(context, ast.TokenType.Semicolon, nameof(parseVarDeclaration));
    advance(context);
  }

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.VarDeclaration,
    startPos,
    endPos,
    name: identifier,
    declaredType: type,
    initializer: initializer,
    symbol: null,
    type: null,
  };
}

interface ParseEnumDeclarationOptions {
  isExported?: bool;
}

function parseEnumDeclaration(
  context: ParserSourceFileContext,
  options: ParseEnumDeclarationOptions = {},
): ast.EnumDeclaration {
  logEnter(context, nameof(parseEnumDeclaration));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Enum, nameof(parseEnumDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, ast.TokenType.OpenBrace, nameof(parseEnumDeclaration));
  advance(context);

  const members: ast.EnumMember[] = [];
  while (check(context, ast.TokenType.Identifier)) {
    members.push(parseEnumMember(context));

    if (peek(context).type == ast.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, ast.TokenType.CloseBrace, nameof(parseEnumDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.EnumDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    members,
    symbol: null,
  };
}

function parseEnumMember(context: ParserSourceFileContext): ast.EnumMember {
  logEnter(context, nameof(parseEnumMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  let initializer: ast.Expression | undefined = undefined;
  if (check(context, ast.TokenType.Equals)) {
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
    symbol: null,
  };
}

interface ParseFuncOrMethodDeclarationOptions {
  excludeBody?: bool;
  isExported?: bool;
}

function parseFuncOrMethodDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.FuncDeclaration | ast.MethodDeclaration {
  logEnter(context, nameof(parseFuncOrMethodDeclaration));

  expect(context, ast.TokenType.Func, nameof(parseFuncOrMethodDeclaration));

  if (next(context).type != ast.TokenType.OpenParen) {
    return parseFuncDeclaration(context, options);
  }

  return parseMethodDeclaration(context, options);
}

function parseFuncDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.FuncDeclaration {
  logEnter(context, nameof(parseFuncDeclaration));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Func, nameof(parseFuncDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseFuncDeclaration));
  advance(context);

  const args: ast.VarDeclaration[] = [];
  while (check(context, ast.TokenType.Identifier)) {
    args.push(parseVarDeclaration(context, { skipVarKeyword: true }));

    if (peek(context).type == ast.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, ast.TokenType.CloseParen, nameof(parseFuncDeclaration));
  advance(context);

  // TODO: Should we just remove the colon before the return type?
  expect(context, ast.TokenType.Colon, nameof(parseFuncDeclaration));
  advance(context);

  const returnType = parseType(context);

  const body = !options.excludeBody ? parseStatementBlock(context) : ast.makeStatementBlock([]);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.FuncDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    args: args,
    returnType,
    body,
    locals: {},
    nextSymbolScope: null,
    symbol: null,
  };
}

function parseMethodDeclaration(
  context: ParserSourceFileContext,
  options: ParseFuncOrMethodDeclarationOptions = {},
): ast.MethodDeclaration {
  logEnter(context, nameof(parseMethodDeclaration));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Func, nameof(parseMethodDeclaration));
  advance(context);

  const receiver = parseMethodReciever(context);

  const name = parseIdentifier(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseMethodDeclaration));
  advance(context);

  const args: ast.VarDeclaration[] = [];
  while (check(context, ast.TokenType.Identifier)) {
    args.push(parseVarDeclaration(context, { skipVarKeyword: true }));

    if (peek(context).type == ast.TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, ast.TokenType.CloseParen, nameof(parseMethodDeclaration));
  advance(context);

  // TODO: Should we just remove the colon before the return type?
  expect(context, ast.TokenType.Colon, nameof(parseMethodDeclaration));
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
    args: args,
    returnType,
    body,
    locals: {},
    nextSymbolScope: null,
    symbol: null,
  };
}

function parseMethodReciever(
  context: ParserSourceFileContext,
): ast.MethodReceiver {
  logEnter(context, nameof(parseMethodReciever));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseMethodReciever));
  advance(context);

  const identifier = parseIdentifier(context);

  expect(context, ast.TokenType.Colon, nameof(parseMethodReciever));
  advance(context);

  const type = parseTypeReference(context);

  expect(context, ast.TokenType.CloseParen, nameof(parseMethodReciever));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.MethodReceiver,
    startPos,
    endPos,
    name: identifier,
    declaredType: type,
    symbol: null,
    type: null,
  };
}

interface ParseStructDeclarationOptions {
  isExported?: bool;
}

function parseStructDeclaration(
  context: ParserSourceFileContext,
  options: ParseStructDeclarationOptions = {},
): ast.StructDeclaration {
  logEnter(context, nameof(parseStructDeclaration));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Struct, nameof(parseStructDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, ast.TokenType.OpenBrace, nameof(parseStructDeclaration));
  advance(context);

  const members: Array<ast.StructMember> = [];
  while (check(context, ast.TokenType.Identifier)) {
    members.push(parseStructMember(context));
  }

  expect(context, ast.TokenType.CloseBrace, nameof(parseStructDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StructDeclaration,
    startPos,
    endPos,
    isExported: !!options.isExported,
    name,
    members,
    symbol: null,
  };
}

function parseStructMember(context: ParserSourceFileContext): ast.StructMember {
  logEnter(context, nameof(parseStructMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  expect(context, ast.TokenType.Colon, nameof(parseStructMember));
  advance(context);

  const type = parseIdentifier(context);

  expect(context, ast.TokenType.Semicolon, nameof(parseStructMember));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StructMember,
    startPos,
    endPos,
    name,
    declaredType: type,
    symbol: null,
  };
}

function parseStatementBlock(context: ParserSourceFileContext): ast.StatementBlock {
  logEnter(context, nameof(parseStatementBlock));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenBrace, nameof(parseStatementBlock));
  advance(context);

  const statements: Array<ast.Statement> = [];
  while (!isEOF(context) && peek(context).type != ast.TokenType.CloseBrace) {
    try {
      statements.push(parseBlockLevelStatement(context));
    } catch (error) {
      context.base.diagnostics.push(<ast.Diagnostic> error);
      resync(context, [ast.TokenType.Semicolon, ast.TokenType.CloseBrace]);

      // TODO: peek(context).type can be replaced with check
      if (peek(context).type == ast.TokenType.Semicolon) {
        advance(context);
      }
    }
  }

  expect(context, ast.TokenType.CloseBrace, nameof(parseStatementBlock));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.StatementBlock,
    startPos,
    endPos,
    statements,
    locals: {},
    nextSymbolScope: null,
  };
}

function parseBlockLevelStatement(context: ParserSourceFileContext): ast.Statement {
  logEnter(context, nameof(parseBlockLevelStatement));
  const token = peek(context);

  let result: ast.Statement;
  switch (token.type) {
    case ast.TokenType.Var:
      result = parseVarDeclaration(context);
      break;

    case ast.TokenType.Defer:
      result = parseDeferStatement(context);
      break;

    case ast.TokenType.If:
      result = parseIfStatement(context);
      break;

    case ast.TokenType.While:
      result = parseWhileStatement(context);
      break;

    case ast.TokenType.Return:
      result = parseReturnStatement(context);
      break;

    case ast.TokenType.OpenBrace:
      result = parseStatementBlock(context);
      break;

    default:
      result = parseExpressionStatement(context);
      break;
  }

  return result;
}

function parseExpressionStatement(context: ParserSourceFileContext): ast.ExpressionStatement {
  logEnter(context, nameof(parseExpressionStatement));
  const startPos = getPos(context);

  const expression = parseExpression(context);

  expect(context, ast.TokenType.Semicolon, nameof(parseExpressionStatement));
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
  logEnter(context, nameof(parseDeferStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Defer, nameof(parseDeferStatement));
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
  logEnter(context, nameof(parseIfStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.If, nameof(parseIfStatement));
  advance(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseIfStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, ast.TokenType.CloseParen, nameof(parseIfStatement));
  advance(context);

  const then = parseBlockLevelStatement(context);

  let _else: ast.Statement | undefined = undefined;

  // TODO: Can this be replaced with check?
  if (match(context, [ast.TokenType.Else])) {
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
  logEnter(context, nameof(parseWhileStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.While, nameof(parseWhileStatement));
  advance(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseWhileStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, ast.TokenType.CloseParen, nameof(parseWhileStatement));
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
  logEnter(context, nameof(parseReturnStatement));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Return, nameof(parseReturnStatement));
  advance(context);

  const expression = parseExpression(context);

  expect(context, ast.TokenType.Semicolon, nameof(parseReturnStatement));
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
  logEnter(context, nameof(parseExpression));
  return parseAssignmentExpression(context);
}

const ASSIGNMENT_TOKENS = [
  ast.TokenType.Equals,
  ast.TokenType.PlusEquals,
  ast.TokenType.MinusEquals,
  ast.TokenType.AsteriskEquals,
  ast.TokenType.SlashEquals,
];

const ASSIGNMENT_OPERATORS_MAP: Partial<Record<ast.TokenType, ast.Operator>> = {
  [ast.TokenType.Equals]: ast.Operator.Equals,
  [ast.TokenType.PlusEquals]: ast.Operator.PlusEquals,
  [ast.TokenType.MinusEquals]: ast.Operator.MinusEquals,
  [ast.TokenType.AsteriskEquals]: ast.Operator.AsteriskEquals,
  [ast.TokenType.SlashEquals]: ast.Operator.SlashEquals,
};

function parseAssignmentExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseAssignmentExpression));
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

    const assignmentExpression: ast.AssignmentExpression = {
      kind: ast.SyntaxKind.AssignmentExpression,
      startPos,
      endPos,
      name: <ast.Identifier> expression,
      operator: ASSIGNMENT_OPERATORS_MAP[operatorToken.type] as ast.AssignmentExpression["operator"],
      value,
      symbol: null,
      type: null,
    };

    return assignmentExpression;
  } else {
    return expression;
  }
}

function parseLogicalOrExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseLogicalOrExpression));
  const startPos = getPos(context);

  let result = parseLogicalAndExpression(context);

  while (match(context, [ast.TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    const endPos = getPos(context);

    result = <ast.LogicalExpression> {
      kind: ast.SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: ast.Operator.BarBar,
      rhs: rhs,
      type: null,
    };
  }

  return result;
}

function parseLogicalAndExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseLogicalAndExpression));
  const startPos = getPos(context);

  let result = parseEqualityExpression(context);

  while (match(context, [ast.TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    const endPos = getPos(context);

    result = <ast.LogicalExpression> {
      kind: ast.SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: ast.Operator.AmpersandAmpersand,
      rhs,
      type: null,
    };
  }

  return result;
}

function parseEqualityExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseEqualityExpression));
  const startPos = getPos(context);

  let result = parseComparisonExpression(context);

  while (match(context, [ast.TokenType.EqualsEquals, ast.TokenType.ExclamationEquals])) {
    const operatorToken = previous(context);

    const rhs = parseComparisonExpression(context);

    const endPos = getPos(context);

    result = <ast.EqualityExpression> {
      kind: ast.SyntaxKind.EqualityExpression,
      startPos,
      endPos,
      lhs: result,
      operator: operatorToken.type == ast.TokenType.EqualsEquals
        ? ast.Operator.EqualsEquals
        : ast.Operator.ExclamationEquals,
      rhs,
      type: null,
    };
  }

  return result;
}

function parseComparisonExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseComparisonExpression));
  const startPos = getPos(context);

  const lhs = parseAdditiveExpression(context);

  const operatorToken = peek(context);
  if (
    operatorToken.type == ast.TokenType.GreaterThan ||
    operatorToken.type == ast.TokenType.GreaterThanEqual ||
    operatorToken.type == ast.TokenType.LessThan ||
    operatorToken.type == ast.TokenType.LessThanEqual
  ) {
    advance(context);

    const rhs = parseAdditiveExpression(context);

    let operator = ast.Operator.GreaterThan;
    switch (operatorToken.type) {
      case ast.TokenType.GreaterThan:
        operator = ast.Operator.GreaterThan;
        break;

      case ast.TokenType.GreaterThanEqual:
        operator = ast.Operator.GreaterThanEquals;
        break;

      case ast.TokenType.LessThan:
        operator = ast.Operator.LessThan;
        break;

      case ast.TokenType.LessThanEqual:
        operator = ast.Operator.LessThanEquals;
        break;
    }

    const endPos = getPos(context);

    const comparisonExpression: ast.ComparisonExpression = {
      kind: ast.SyntaxKind.ComparisonExpression,
      startPos,
      endPos,
      lhs,
      operator,
      rhs,
      symbol: null,
      type: null,
    };

    return comparisonExpression;
  } else {
    return lhs;
  }
}

function parseAdditiveExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseAdditiveExpression));
  const startPos = getPos(context);

  let result = parseMultiplicativeExpression(context);

  let operatorToken = peek(context);
  while (operatorToken.type == ast.TokenType.Plus || operatorToken.type == ast.TokenType.Minus) {
    advance(context);

    const rhs = parseMultiplicativeExpression(context);

    const endPos = getPos(context);

    result = <ast.AdditiveExpression> {
      kind: ast.SyntaxKind.AdditiveExpression,
      startPos,
      endPos,
      lhs: result,
      operator: operatorToken.type == ast.TokenType.Plus ? ast.Operator.Plus : ast.Operator.Minus,
      rhs,
      type: null,
    };

    operatorToken = peek(context);
  }

  return result;
}

function parseMultiplicativeExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseMultiplicativeExpression));
  const startPos = getPos(context);

  let result = parseUnaryExpression(context);

  let operatorToken = peek(context);
  while (operatorToken.type == ast.TokenType.Asterisk || operatorToken.type == ast.TokenType.Slash) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    const endPos = getPos(context);

    result = <ast.MultiplicativeExpression> {
      kind: ast.SyntaxKind.MultiplicativeExpression,
      startPos,
      endPos,
      lhs: result,
      operator: operatorToken.type == ast.TokenType.Asterisk ? ast.Operator.Asterisk : ast.Operator.Slash,
      rhs,
      type: null,
    };

    operatorToken = peek(context);
  }

  return result;
}

// TODO: Implement this similar to parseAssignmentExpression.
function parseUnaryExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parseUnaryExpression));
  const startPos = getPos(context);

  const operatorToken = peek(context);
  if (
    operatorToken.type == ast.TokenType.Ampersand ||
    operatorToken.type == ast.TokenType.Asterisk ||
    operatorToken.type == ast.TokenType.Exclamation ||
    operatorToken.type == ast.TokenType.Minus
  ) {
    advance(context);

    const expression = parseUnaryExpression(context);

    let operator: ast.Operator = ast.Operator.Asterisk;
    switch (operatorToken.type) {
      case ast.TokenType.Ampersand:
        operator = ast.Operator.Ampersand;
        break;

      case ast.TokenType.Asterisk:
        operator = ast.Operator.Asterisk;
        break;

      case ast.TokenType.Exclamation:
        operator = ast.Operator.Exclamation;
        break;

      case ast.TokenType.Minus:
        operator = ast.Operator.Minus;
        break;
    }

    const endPos = getPos(context);

    const unaryExpression: ast.UnaryExpression = {
      kind: ast.SyntaxKind.UnaryExpression,
      startPos,
      endPos,
      operator,
      expression,
      symbol: null,
      type: null,
    };

    return unaryExpression;
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserSourceFileContext): ast.Expression {
  logEnter(context, nameof(parsePrimaryExpression));

  let result: ast.Expression;
  let token = peek(context);

  switch (token.type) {
    case ast.TokenType.Identifier:
      result = parseIdentifier(context);
      break;

    case ast.TokenType.Integer:
      result = parseIntLiteral(context);
      break;

    case ast.TokenType.OpenBrace:
      result = parseStructLiteral(context);
      break;

    case ast.TokenType.OpenBracket:
      result = parseArrayLiteral(context);
      break;

    case ast.TokenType.OpenParen:
      result = parseParenthesizedExpression(context);
      break;

    case ast.TokenType.True:
    case ast.TokenType.False:
      result = parseBoolLiteral(context);
      break;

    case ast.TokenType.String:
      result = parseStringLiteral(context);
      break;

    default:
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownExpression,
        `Token type ${ast.TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
      );
  }

  // TODO: Use match here.
  token = peek(context);
  while ([ast.TokenType.OpenParen, ast.TokenType.OpenBracket, ast.TokenType.Dot].includes(token.type)) {
    if (token.type == ast.TokenType.OpenParen) {
      result = parseCallExpression(context, result);
    } else if (token.type == ast.TokenType.OpenBracket) {
      result = parseElementAccessExpression(context, result);
    } else if (token.type == ast.TokenType.Dot) {
      result = parsePropertyAccessExpression(context, result);
    }

    token = peek(context);
  }

  return result;
}

function parseParenthesizedExpression(context: ParserSourceFileContext): ast.ParenthesizedExpression {
  logEnter(context, nameof(parseParenthesizedExpression));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseParenthesizedExpression));
  advance(context);

  const expression = parseExpression(context);

  expect(context, ast.TokenType.CloseParen, nameof(parseParenthesizedExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ParenthesizedExpression,
    startPos,
    endPos,
    expression,
    symbol: null,
    type: null,
  };
}

function parseCallExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.CallExpression {
  logEnter(context, nameof(parseCallExpression));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenParen, nameof(parseCallExpression));
  advance(context);

  const args = parseCallExpressionArguments(context);

  expect(context, ast.TokenType.CloseParen, nameof(parseCallExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.CallExpression,
    startPos,
    endPos,
    expression,
    args: args,
    symbol: null,
    type: null,
  };
}

function parseElementAccessExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.ElementAccessExpression {
  logEnter(context, nameof(parseElementAccessExpression));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenBracket, nameof(parseElementAccessExpression));
  advance(context);

  const argumentExpression = parseExpression(context);

  expect(context, ast.TokenType.CloseBracket, nameof(parseElementAccessExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ElementAccessExpression,
    startPos,
    endPos,
    expression,
    argumentExpression,
    symbol: null,
    type: null,
  };
}

function parsePropertyAccessExpression(
  context: ParserSourceFileContext,
  expression: ast.Expression,
): ast.PropertyAccessExpression {
  logEnter(context, nameof(parsePropertyAccessExpression));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Dot, nameof(parsePropertyAccessExpression));
  advance(context);

  const name = parseIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.PropertyAccessExpression,
    startPos,
    endPos,
    expression,
    name,
    symbol: null,
    type: null,
  };
}

function parseCallExpressionArguments(context: ParserSourceFileContext): ast.Expression[] {
  logEnter(context, nameof(parseCallExpressionArguments));

  const args: Array<ast.Expression> = [];

  // TODO: Use check here.
  let token = peek(context);
  while (!isEOF(context) && token.type != ast.TokenType.CloseParen) {
    args.push(parseExpression(context));

    token = peek(context);
    if (token.type == ast.TokenType.Comma) {
      advance(context);
      token = peek(context);
    }
  }

  return args;
}

function parseType(context: ParserSourceFileContext): ast.TypeNode {
  logEnter(context, nameof(parseType));

  const token = peek(context);
  if (token.type == ast.TokenType.Asterisk) {
    return parsePointerType(context);
  } else if (token.type == ast.TokenType.OpenBracket) {
    return parseArrayType(context);
  } else {
    return parseTypeReference(context);
  }
}

function parsePointerType(context: ParserSourceFileContext): ast.PointerType {
  logEnter(context, nameof(parsePointerType));
  const startPos = getPos(context);

  expect(context, ast.TokenType.Asterisk, nameof(parsePointerType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.PointerType,
    startPos,
    endPos,
    elementType,
    symbol: null,
    type: null,
  };
}

function parseArrayType(context: ParserSourceFileContext): ast.ArrayType {
  logEnter(context, nameof(parseArrayType));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenBracket, nameof(parseArrayType));
  advance(context);

  expect(context, ast.TokenType.CloseBracket, nameof(parseArrayType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ArrayType,
    startPos,
    endPos,
    elementType,
    symbol: null,
    type: null,
  };
}

function parseTypeReference(context: ParserSourceFileContext): ast.TypeReference {
  logEnter(context, nameof(parseTypeReference));
  const startPos = getPos(context);

  const typeName = parseQualifiedTypeOrIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.TypeReference,
    startPos,
    endPos,
    typeName,
    symbol: null,
    type: null,
  };
}

function parseQualifiedTypeOrIdentifier(context: ParserSourceFileContext): ast.QualifiedName | ast.Identifier {
  logEnter(context, nameof(parseQualifiedTypeOrIdentifier));
  const startPos = getPos(context);

  const left = parseIdentifier(context);

  let result: ast.QualifiedName | ast.Identifier = left;

  if (peek(context).type == ast.TokenType.Dot) {
    advance(context);

    const right = parseIdentifier(context);

    const endPos = getPos(context);

    result = {
      kind: ast.SyntaxKind.QualifiedName,
      startPos,
      endPos,
      left: result,
      right: right,
      symbol: null,
    };
  }

  return result;
}

function parseIdentifier(context: ParserSourceFileContext): ast.Identifier {
  logEnter(context, nameof(parseIdentifier));
  const startPos = getPos(context);

  const token = expect(context, ast.TokenType.Identifier, nameof(parseIdentifier));

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
    symbol: null,
    type: null,
  };
}

function parseStructLiteral(context: ParserSourceFileContext): ast.StructLiteral {
  logEnter(context, nameof(parseStructLiteral));
  const startPos = getPos(context);

  const startToken = peek(context);
  expect(context, ast.TokenType.OpenBrace, nameof(parseStructLiteral));
  advance(context);

  const elements: ast.StructLiteralElement[] = [];

  let token = peek(context);
  while (token.type != ast.TokenType.CloseBrace) {
    const elementStartPos = getPos(context);

    if (elements.length > 0) {
      expect(context, ast.TokenType.Comma, nameof(parseStructLiteral));
      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == ast.TokenType.CloseBrace) {
        break;
      }
    }

    let name: ast.Identifier | undefined = undefined;
    if (peek(context).type == ast.TokenType.Identifier) {
      const identifier = parseIdentifier(context);

      name = identifier;

      expect(context, ast.TokenType.Colon, nameof(parseStructLiteral));
      advance(context);
    }

    const expression = parseExpression(context);

    const elementEndPos = getPos(context);

    elements.push(
      {
        kind: ast.SyntaxKind.StructLiteralElement,
        startPos: elementStartPos,
        endPos: elementEndPos,
        name: name,
        expression: expression,
      },
    );

    token = peek(context);
  }

  expect(context, ast.TokenType.CloseBrace, nameof(parseStructLiteral));
  advance(context);

  const endPos = getPos(context);

  if (elements.some((element) => element.name) && !elements.every((element) => element.name)) {
    throw parserError(
      context.fileName,
      startToken,
      ParserErrorKind.InvalidStructLiteral,
      `All ${nameofSyntaxKind(ast.SyntaxKind.StructLiteral)} elements must be named or unnnamed and cannot be mixed.`,
    );
  }

  return {
    kind: ast.SyntaxKind.StructLiteral,
    startPos,
    endPos,
    elements,
    symbol: null,
    type: null,
  };
}

function parseArrayLiteral(context: ParserSourceFileContext): ast.ArrayLiteral {
  logEnter(context, nameof(parseArrayLiteral));
  const startPos = getPos(context);

  expect(context, ast.TokenType.OpenBracket, nameof(parseArrayLiteral));
  advance(context);

  const elements: ast.Expression[] = [];
  let token = peek(context);
  while (token.type != ast.TokenType.CloseBracket) {
    if (elements.length > 0) {
      expect(context, ast.TokenType.Comma, nameof(parseArrayLiteral));
      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == ast.TokenType.CloseBracket) {
        break;
      }
    }

    elements.push(parseExpression(context));

    token = peek(context);
  }

  expect(context, ast.TokenType.CloseBracket, nameof(parseArrayLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.ArrayLiteral,
    startPos,
    endPos,
    elements,
    symbol: null,
    type: null,
  };
}

function parseBoolLiteral(context: ParserSourceFileContext): ast.BoolLiteral {
  logEnter(context, nameof(parseBoolLiteral));
  const startPos = getPos(context);

  const token = expect(context, [ast.TokenType.True, ast.TokenType.False], nameof(parseBoolLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.BoolLiteral,
    startPos,
    endPos,
    value: token.type == ast.TokenType.True,
    symbol: null,
    type: null,
  };
}

function parseIntLiteral(context: ParserSourceFileContext): ast.IntLiteral {
  logEnter(context, nameof(parseIntLiteral));
  const startPos = getPos(context);

  const token = expect(context, ast.TokenType.Integer, nameof(parseIntLiteral));

  if (token.text == null) {
    throw parserError(
      context.fileName,
      token,
      ParserErrorKind.TokenTextIsNull,
      `Expected token to have text value in ${nameof(parseIntLiteral)}.`,
    );
  }

  advance(context);

  const endPos = getPos(context);

  return {
    kind: ast.SyntaxKind.IntLiteral,
    startPos,
    endPos,
    value: token.text,
    symbol: null,
    type: null,
  };
}

function parseStringLiteral(context: ParserSourceFileContext): ast.StringLiteral {
  logEnter(context, nameof(parseStringLiteral));
  const startPos = getPos(context);

  const token = expect(context, ast.TokenType.String, nameof(parseStringLiteral));

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
    symbol: null,
    type: null,
  };
}
