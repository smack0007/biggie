import { dirname, isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { bool, int, nameof } from "../shims.ts";
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
} from "./ast/mod.ts";
import { scan, Token, TokenType } from "./scanner.ts";
import { Program, ProgramDiagnostic, TextPosition } from "./program.ts";

export interface ParserLogger {
  enter(name: string, fileName: string, token?: Token): void;
}

interface ParserContext {
  logger?: ParserLogger;
  entryFileName: string;
  sourceFiles: Record<string, SourceFile>;
  diagnostics: ProgramDiagnostic[];
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

export interface ParserError extends ProgramDiagnostic {
  kind: ParserErrorKind;
  fileName: string;
  pos: TextPosition;
  message: string;
}

function resolveModule(filePath: string, basePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
}

function parserError(
  fileName: string,
  token: Token,
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

function getPos(context: ParserSourceFileContext): TextPosition {
  return context.tokens[context.index].pos;
}

function advance(context: ParserSourceFileContext): Token {
  if (!isEOF(context)) {
    context.index += 1;
  }
  return peek(context);
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
): Token {
  const token = peek(context);

  if (Array.isArray(expectedType)) {
    if (!expectedType.includes(token.type)) {
      throw parserError(
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
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnexpectedTokenType,
        `Expected Token of type ${TokenType[expectedType]} but was ${
          TokenType[token.type]
        } (${token.text}) at ${functionName}`,
      );
    }
  }

  return token;
}

function resync(context: ParserSourceFileContext, tokenTypes: TokenType[]): void {
  let nextTokenType = peek(context).type;
  while (nextTokenType != TokenType.EOF && !tokenTypes.includes(nextTokenType)) {
    nextTokenType = advance(context).type;
  }
}

export async function parse(
  entryFileName: string,
  logger?: ParserLogger,
): Promise<Program> {
  const context: ParserContext = {
    logger,
    entryFileName,
    sourceFiles: {},
    diagnostics: [],
  };

  context.sourceFiles[entryFileName] = await parseSourceFile(context, entryFileName);

  return {
    entryFileName,
    sourceFiles: context.sourceFiles,
    diagnostics: context.diagnostics,
  };
}

export async function parseSourceFile(
  baseContext: ParserContext,
  fileName: string,
): Promise<SourceFile> {
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
    try {
      statements.push(await parseTopLevelStatement(context));
    } catch (error) {
      context.base.diagnostics.push(<ProgramDiagnostic> error);
      resync(context, TOP_LEVEL_STATEMENT_TOKEN_TYPES);
    }
  }

  expect(context, TokenType.EOF, nameof(parseSourceFile));

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.SourceFile,
    startPos,
    endPos,
    fileName,
    statements,
    exports: {},
    locals: {},
  };
}

const TOP_LEVEL_STATEMENT_TOKEN_TYPES: TokenType[] = [
  TokenType.Export,
  TokenType.Import,
  TokenType.Var,
  TokenType.Enum,
  TokenType.Func,
  TokenType.Struct,
];

async function parseTopLevelStatement(context: ParserSourceFileContext): Promise<Statement> {
  context.logger.enter(nameof(parseTopLevelStatement));

  let isExported = false;
  if (peek(context).type == TokenType.Export) {
    isExported = true;
    advance(context);
  }

  let result: Statement;
  const token = peek(context);
  switch (token.type) {
    case TokenType.Import:
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
      throw parserError(
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
): Promise<ImportDeclaration> {
  context.logger.enter(nameof(parseImportDeclaration));
  const startPos = getPos(context);

  expect(context, TokenType.Import, nameof(parseImportDeclaration));
  advance(context);

  let alias: Identifier | undefined = undefined;
  if (peek(context).type == TokenType.Identifier) {
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

  const resolvedFileName = resolveModule(module.value, dirname(context.fileName));
  context.base.sourceFiles[resolvedFileName] = await parseSourceFile(context.base, resolvedFileName);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ImportDeclaration,
    startPos,
    endPos,
    alias: alias,
    module: module,
    resolvedFileName,
  };
}

interface ParseVariableDeclarationOptions {
  isFunctionArgument?: bool;
}

function parseVariableDeclaration(
  context: ParserSourceFileContext,
  options: ParseVariableDeclarationOptions = {},
): VariableDeclaration {
  context.logger.enter(nameof(parseVariableDeclaration));
  const startPos = getPos(context);

  if (!options.isFunctionArgument) {
    expect(context, TokenType.Var, nameof(parseVariableDeclaration));
    advance(context);
  }

  const identifier = parseIdentifier(context);

  expect(context, TokenType.Colon, nameof(parseVariableDeclaration));
  advance(context);

  const type = parseType(context);

  let initializer: Expression | undefined = undefined;
  if (check(context, TokenType.Equals)) {
    advance(context);
    initializer = parseExpression(context);
  }

  if (!options.isFunctionArgument) {
    expect(context, TokenType.Semicolon, nameof(parseVariableDeclaration));
    advance(context);
  }

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.VariableDeclaration,
    startPos,
    endPos,
    name: identifier,
    type: type,
    initializer: initializer,
  };
}

// TODO: isExported should be moved into an options object like in parseVariableDeclaration.
function parseEnumDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): EnumDeclaration {
  context.logger.enter(nameof(parseEnumDeclaration));
  const startPos = getPos(context);

  expect(context, TokenType.Enum, nameof(parseEnumDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, TokenType.OpenBrace, nameof(parseEnumDeclaration));
  advance(context);

  const members: EnumMember[] = [];
  while (check(context, TokenType.Identifier)) {
    members.push(parseEnumMember(context));

    if (peek(context).type == TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, TokenType.CloseBrace, nameof(parseEnumDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.EnumDeclaration,
    startPos,
    endPos,
    isExported,
    name,
    members,
  };
}

function parseEnumMember(context: ParserSourceFileContext): EnumMember {
  context.logger.enter(nameof(parseEnumMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  let initializer: Expression | undefined = undefined;
  if (check(context, TokenType.Equals)) {
    advance(context);
    initializer = parseExpression(context);
  }

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.EnumMember,
    startPos,
    endPos,
    name,
    initializer,
  };
}

function parseFunctionDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): FunctionDeclaration {
  context.logger.enter(nameof(parseFunctionDeclaration));
  const startPos = getPos(context);

  expect(context, TokenType.Func, nameof(parseFunctionDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, TokenType.OpenParen, nameof(parseFunctionDeclaration));
  advance(context);

  const args: VariableDeclaration[] = [];
  while (check(context, TokenType.Identifier)) {
    args.push(parseVariableDeclaration(context, { isFunctionArgument: true }));

    if (peek(context).type == TokenType.Comma) {
      advance(context);
    }
  }

  expect(context, TokenType.CloseParen, nameof(parseFunctionDeclaration));
  advance(context);

  // TODO: Should we just remove the colon before the return type?
  expect(context, TokenType.Colon, nameof(parseFunctionDeclaration));
  advance(context);

  const returnType = parseType(context);

  const body = parseStatementBlock(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.FunctionDeclaration,
    startPos,
    endPos,
    isExported,
    name,
    arguments: args,
    returnType,
    body,
  };
}

function parseStructDeclaration(
  context: ParserSourceFileContext,
  isExported: boolean,
): StructDeclaration {
  context.logger.enter(nameof(parseStructDeclaration));
  const startPos = getPos(context);

  expect(context, TokenType.Struct, nameof(parseStructDeclaration));
  advance(context);

  const name = parseIdentifier(context);

  expect(context, TokenType.OpenBrace, nameof(parseStructDeclaration));
  advance(context);

  const members: Array<StructMember> = [];
  while (check(context, TokenType.Identifier)) {
    members.push(parseStructMember(context));
  }

  expect(context, TokenType.CloseBrace, nameof(parseStructDeclaration));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.StructDeclaration,
    startPos,
    endPos,
    isExported,
    name,
    members,
  };
}

function parseStructMember(context: ParserSourceFileContext): StructMember {
  context.logger.enter(nameof(parseStructMember));
  const startPos = getPos(context);

  const name = parseIdentifier(context);

  expect(context, TokenType.Colon, nameof(parseStructMember));
  advance(context);

  const type = parseIdentifier(context);

  expect(context, TokenType.Semicolon, nameof(parseStructMember));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.StructMember,
    startPos,
    endPos,
    name,
    type,
  };
}

function parseStatementBlock(context: ParserSourceFileContext): StatementBlock {
  context.logger.enter(nameof(parseStatementBlock));
  const startPos = getPos(context);

  expect(context, TokenType.OpenBrace, nameof(parseStatementBlock));
  advance(context);

  const statements: Array<Statement> = [];
  while (!isEOF(context) && peek(context).type != TokenType.CloseBrace) {
    try {
      statements.push(parseBlockLevelStatement(context));
    } catch (error) {
      context.base.diagnostics.push(<ProgramDiagnostic> error);
      resync(context, [TokenType.Semicolon, TokenType.CloseBrace]);

      // TODO: peek(context).type can be replaced with check
      if (peek(context).type == TokenType.Semicolon) {
        advance(context);
      }
    }
  }

  expect(context, TokenType.CloseBrace, nameof(parseStatementBlock));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.StatementBlock,
    startPos,
    endPos,
    statements,
    locals: {},
  };
}

function parseBlockLevelStatement(context: ParserSourceFileContext): Statement {
  context.logger.enter(nameof(parseBlockLevelStatement));
  const token = peek(context);

  let result: Statement;
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

function parseExpressionStatement(context: ParserSourceFileContext): ExpressionStatement {
  context.logger.enter(nameof(parseExpressionStatement));
  const startPos = getPos(context);

  const expression = parseExpression(context);

  expect(context, TokenType.Semicolon, nameof(parseExpressionStatement));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ExpressionStatement,
    startPos,
    endPos,
    expression,
  };
}

function parseDeferStatement(context: ParserSourceFileContext): DeferStatement {
  context.logger.enter(nameof(parseDeferStatement));
  const startPos = getPos(context);

  expect(context, TokenType.Defer, nameof(parseDeferStatement));
  advance(context);

  const body = parseBlockLevelStatement(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.DeferStatement,
    startPos,
    endPos,
    body,
  };
}

function parseIfStatement(context: ParserSourceFileContext): IfStatement {
  context.logger.enter(nameof(parseIfStatement));
  const startPos = getPos(context);

  expect(context, TokenType.If, nameof(parseIfStatement));
  advance(context);

  expect(context, TokenType.OpenParen, nameof(parseIfStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, TokenType.CloseParen, nameof(parseIfStatement));
  advance(context);

  const then = parseBlockLevelStatement(context);

  let _else: Statement | undefined = undefined;

  // TODO: Can this be replaced with check?
  if (match(context, [TokenType.Else])) {
    _else = parseBlockLevelStatement(context);
  }

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.IfStatement,
    startPos,
    endPos,
    condition,
    then,
    else: _else,
  };
}

function parseWhileStatement(context: ParserSourceFileContext): WhileStatement {
  context.logger.enter(nameof(parseWhileStatement));
  const startPos = getPos(context);

  expect(context, TokenType.While, nameof(parseWhileStatement));
  advance(context);

  expect(context, TokenType.OpenParen, nameof(parseWhileStatement));
  advance(context);

  const condition = parseExpression(context);

  expect(context, TokenType.CloseParen, nameof(parseWhileStatement));
  advance(context);

  const body = parseBlockLevelStatement(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.WhileStatement,
    startPos,
    endPos,
    condition,
    body,
  };
}

function parseReturnStatement(context: ParserSourceFileContext): ReturnStatement {
  context.logger.enter(nameof(parseReturnStatement));
  const startPos = getPos(context);

  expect(context, TokenType.Return, nameof(parseReturnStatement));
  advance(context);

  const expression = parseExpression(context);

  expect(context, TokenType.Semicolon, nameof(parseReturnStatement));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ReturnStatement,
    startPos,
    endPos,
    expression,
  };
}

function parseExpression(context: ParserSourceFileContext): Expression {
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

function parseAssignmentExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseAssignmentExpression));
  const startPos = getPos(context);

  const startToken = peek(context);
  const expression = parseLogicalOrExpression(context);

  if (match(context, ASSIGNMENT_TOKENS)) {
    const operatorToken = previous(context);
    const value = parseExpression(context);

    if (expression.kind != SyntaxKind.Identifier) {
      throw parserError(
        context.fileName,
        startToken,
        ParserErrorKind.InvalidAssignmentTarget,
        "Invalid assignment target.",
      );
    }

    const endPos = getPos(context);

    return <AssignmentExpression> {
      kind: SyntaxKind.AssignmentExpression,
      startPos,
      endPos,
      name: expression as Identifier,
      operator: ASSIGNMENT_OPERATORS_MAP[operatorToken.type] as AssignmentExpression["operator"],
      value,
    };
  } else {
    return expression;
  }
}

function parseLogicalOrExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseLogicalOrExpression));
  const startPos = getPos(context);

  let result = parseLogicalAndExpression(context);

  while (match(context, [TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    const endPos = getPos(context);

    result = <LogicalExpression> {
      kind: SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: Operator.BarBar,
      rhs: rhs,
    };
  }

  return result;
}

function parseLogicalAndExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseLogicalAndExpression));
  const startPos = getPos(context);

  let result = parseEqualityExpression(context);

  while (match(context, [TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    const endPos = getPos(context);

    result = <LogicalExpression> {
      kind: SyntaxKind.LogicalExpression,
      startPos,
      endPos,
      lhs: result,
      operator: Operator.AmpersandAmpersand,
      rhs,
    };
  }

  return result;
}

function parseEqualityExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseEqualityExpression));
  const startPos = getPos(context);

  let result = parseComparisonExpression(context);

  while (match(context, [TokenType.EqualsEquals, TokenType.ExclamationEquals])) {
    const operatorToken = previous(context);

    const rhs = parseComparisonExpression(context);

    const endPos = getPos(context);

    result = <EqualityExpression> {
      kind: SyntaxKind.EqualityExpression,
      startPos,
      endPos,
      lhs: result,
      operator: operatorToken.type == TokenType.EqualsEquals ? Operator.EqualsEquals : Operator.ExclamationEquals,
      rhs,
    };
  }

  return result;
}

function parseComparisonExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseComparisonExpression));
  const startPos = getPos(context);

  const lhs = parseAdditiveExpression(context);

  const operatorToken = peek(context);
  if (
    operatorToken.type == TokenType.GreaterThan ||
    operatorToken.type == TokenType.GreaterThanEqual ||
    operatorToken.type == TokenType.LessThan ||
    operatorToken.type == TokenType.LessThanEqual
  ) {
    advance(context);

    const rhs = parseAdditiveExpression(context);

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

    return <ComparisonExpression> {
      kind: SyntaxKind.ComparisonExpression,
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

function parseAdditiveExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseAdditiveExpression));
  const startPos = getPos(context);

  const lhs = parseMultiplicativeExpression(context);

  // TODO: Use match here.
  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Plus || operatorToken.type == TokenType.Minus) {
    advance(context);

    const rhs = parseMultiplicativeExpression(context);

    const endPos = getPos(context);

    return <AdditiveExpression> {
      kind: SyntaxKind.AdditiveExpression,
      startPos,
      endPos,
      lhs,
      operator: operatorToken.type == TokenType.Plus ? Operator.Plus : Operator.Minus,
      rhs,
    };
  } else {
    return lhs;
  }
}

function parseMultiplicativeExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parseMultiplicativeExpression));
  const startPos = getPos(context);

  const lhs = parseUnaryExpression(context);

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Asterisk || operatorToken.type == TokenType.Slash) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    const endPos = getPos(context);

    return <MultiplicativeExpression> {
      kind: SyntaxKind.MultiplicativeExpression,
      startPos,
      endPos,
      lhs,
      operator: operatorToken.type == TokenType.Asterisk ? Operator.Asterisk : Operator.Slash,
      rhs,
    };
  } else {
    return lhs;
  }
}

// TODO: Implement this similar to parseAssignmentExpression.
function parseUnaryExpression(context: ParserSourceFileContext): Expression {
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

    return <UnaryExpression> {
      kind: SyntaxKind.UnaryExpression,
      startPos,
      endPos,
      operator,
      expression,
    };
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserSourceFileContext): Expression {
  context.logger.enter(nameof(parsePrimaryExpression));

  let result: Expression;
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
      throw parserError(
        context.fileName,
        token,
        ParserErrorKind.UnknownExpression,
        `Token type ${TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
      );
  }

  // TODO: Use match here.
  token = peek(context);
  while ([TokenType.OpenParen, TokenType.OpenBracket, TokenType.Dot].includes(token.type)) {
    if (token.type == TokenType.OpenParen) {
      result = parseCallExpression(context, result);
    } else if (token.type == TokenType.OpenBracket) {
      result = parseElementAccessExpression(context, result);
    } else if (token.type == TokenType.Dot) {
      result = parsePropertyAccessExpression(context, result);
    }

    token = peek(context);
  }

  return result;
}

function parseParenthesizedExpression(context: ParserSourceFileContext): ParenthesizedExpression {
  context.logger.enter(nameof(parseParenthesizedExpression));
  const startPos = getPos(context);

  expect(context, TokenType.OpenParen, nameof(parseParenthesizedExpression));
  advance(context);

  const expression = parseExpression(context);

  expect(context, TokenType.CloseParen, nameof(parseParenthesizedExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ParenthesizedExpression,
    startPos,
    endPos,
    expression,
  };
}

function parseCallExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): CallExpression {
  context.logger.enter(nameof(parseCallExpression));
  const startPos = getPos(context);

  expect(context, TokenType.OpenParen, nameof(parseCallExpression));
  advance(context);

  const args = parseCallExpressionArguments(context);

  expect(context, TokenType.CloseParen, nameof(parseCallExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.CallExpression,
    startPos,
    endPos,
    expression,
    arguments: args,
  };
}

function parseElementAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): ElementAccessExpression {
  context.logger.enter(nameof(parseElementAccessExpression));
  const startPos = getPos(context);

  expect(context, TokenType.OpenBracket, nameof(parseElementAccessExpression));
  advance(context);

  const argumentExpression = parseExpression(context);

  expect(context, TokenType.CloseBracket, nameof(parseElementAccessExpression));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ElementAccessExpression,
    startPos,
    endPos,
    expression,
    argumentExpression,
  };
}

function parsePropertyAccessExpression(
  context: ParserSourceFileContext,
  expression: Expression,
): PropertyAccessExpression {
  context.logger.enter(nameof(parsePropertyAccessExpression));
  const startPos = getPos(context);

  expect(context, TokenType.Dot, nameof(parsePropertyAccessExpression));
  advance(context);

  const name = parseIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.PropertyAccessExpression,
    startPos,
    endPos,
    expression,
    name,
  };
}

function parseCallExpressionArguments(context: ParserSourceFileContext): Expression[] {
  context.logger.enter(nameof(parseCallExpressionArguments));

  const args: Array<Expression> = [];

  // TODO: Use check here.
  let token = peek(context);
  while (!isEOF(context) && token.type != TokenType.CloseParen) {
    args.push(parseExpression(context));

    token = peek(context);
    if (token.type == TokenType.Comma) {
      advance(context);
      token = peek(context);
    }
  }

  return args;
}

function parseType(context: ParserSourceFileContext): TypeNode {
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

function parsePointerType(context: ParserSourceFileContext): PointerType {
  context.logger.enter(nameof(parsePointerType));
  const startPos = getPos(context);

  expect(context, TokenType.Asterisk, nameof(parsePointerType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.PointerType,
    startPos,
    endPos,
    elementType,
  };
}

function parseArrayType(context: ParserSourceFileContext): ArrayType {
  context.logger.enter(nameof(parseArrayType));
  const startPos = getPos(context);

  expect(context, TokenType.OpenBracket, nameof(parseArrayType));
  advance(context);

  expect(context, TokenType.CloseBracket, nameof(parseArrayType));
  advance(context);

  const elementType = parseType(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ArrayType,
    startPos,
    endPos,
    elementType,
  };
}

function parseTypeReference(context: ParserSourceFileContext): TypeReference {
  context.logger.enter(nameof(parseTypeReference));
  const startPos = getPos(context);

  const typeName = parseQualifiedTypeOrIdentifier(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.TypeReference,
    startPos,
    endPos,
    typeName,
  };
}

function parseQualifiedTypeOrIdentifier(context: ParserSourceFileContext): QualifiedName | Identifier {
  context.logger.enter(nameof(parseQualifiedTypeOrIdentifier));
  const startPos = getPos(context);

  const left = parseIdentifier(context);

  let result: QualifiedName | Identifier = left;

  if (peek(context).type == TokenType.Dot) {
    advance(context);

    const right = parseIdentifier(context);

    const endPos = getPos(context);

    result = {
      kind: SyntaxKind.QualifiedName,
      startPos,
      endPos,
      left: result,
      right: right,
    };
  }

  return result;
}

function parseIdentifier(context: ParserSourceFileContext): Identifier {
  context.logger.enter(nameof(parseIdentifier));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Identifier, nameof(parseIdentifier));

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
    kind: SyntaxKind.Identifier,
    startPos,
    endPos,
    value: token.text,
  };
}

function parseStructLiteral(context: ParserSourceFileContext): StructLiteral {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

  expect(context, TokenType.OpenBrace, nameof(parseStructLiteral));
  advance(context);

  const elements: StructLiteralElement[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBrace) {
    const elementStartPos = getPos(context);

    if (elements.length > 0) {
      expect(context, TokenType.Comma, nameof(parseStructLiteral));
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

      name = identifier;

      expect(context, TokenType.Colon, nameof(parseStructLiteral));
      advance(context);
    }

    const expression = parseExpression(context);

    const elementEndPos = getPos(context);

    elements.push({
      kind: SyntaxKind.StructLiteralElement,
      startPos: elementStartPos,
      endPos: elementEndPos,
      name: name,
      expression: expression,
    });

    token = peek(context);
  }

  expect(context, TokenType.CloseBrace, nameof(parseStructLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.StructLiteral,
    startPos,
    endPos,
    elements,
  };
}

function parseArrayLiteral(context: ParserSourceFileContext): ArrayLiteral {
  context.logger.enter(nameof(parseArrayLiteral));
  const startPos = getPos(context);

  expect(context, TokenType.OpenBracket, nameof(parseArrayLiteral));
  advance(context);

  const elements: Expression[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBracket) {
    if (elements.length > 0) {
      expect(context, TokenType.Comma, nameof(parseArrayLiteral));
      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == TokenType.CloseBracket) {
        break;
      }
    }

    elements.push(parseExpression(context));

    token = peek(context);
  }

  expect(context, TokenType.CloseBracket, nameof(parseArrayLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.ArrayLiteral,
    startPos,
    endPos,
    elements,
  };
}

function parseBooleanLiteral(context: ParserSourceFileContext): BooleanLiteral {
  context.logger.enter(nameof(parseBooleanLiteral));
  const startPos = getPos(context);

  const token = expect(context, [TokenType.True, TokenType.False], nameof(parseBooleanLiteral));
  advance(context);

  const endPos = getPos(context);

  return {
    kind: SyntaxKind.BooleanLiteral,
    startPos,
    endPos,
    value: token.type == TokenType.True,
  };
}

function parseIntegerLiteral(context: ParserSourceFileContext): IntegerLiteral {
  context.logger.enter(nameof(parseIntegerLiteral));
  const startPos = getPos(context);

  const token = expect(context, TokenType.Integer, nameof(parseIntegerLiteral));

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
    kind: SyntaxKind.IntegerLiteral,
    startPos,
    endPos,
    value: token.text,
  };
}

function parseStringLiteral(context: ParserSourceFileContext): StringLiteral {
  context.logger.enter(nameof(parseStringLiteral));
  const startPos = getPos(context);

  const token = expect(context, TokenType.String, nameof(parseStringLiteral));

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
    kind: SyntaxKind.StringLiteral,
    startPos,
    endPos,
    value: token.text,
  };
}
