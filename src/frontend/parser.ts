import { Result, bool, int, nameof } from "../shims.ts";
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
  IntegerLiteral,
  LogicalExpression,
  MultiplcativeExpression,
  Operator,
  ParenthesizedExpression,
  PointerType,
  PropertyAccessExpression,
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
import { Token, TokenType } from "./scanner.ts";

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
  return peek(context).type == TokenType.EndOfFile;
}

function match(context: ParserContext, types: Array<TokenType>): bool {
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
  functionName: string,
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
          } at ${functionName}`,
        ),
      };
    }
  } else {
    if (token.type != expectedType) {
      return {
        error: createError(
          token,
          ParserErrorKind.UnexpectedTokenType,
          `Expected Token of Type ${TokenType[expectedType]} but was ${TokenType[token.type]} (${
            token.text
          }) at ${functionName}`,
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

  context.logger.enter(nameof(parse));

  while (!isEOF(context)) {
    const statement = parseTopLevelStatement(context);

    if (statement.error != null) {
      return { error: statement.error };
    }

    statements.push(statement.value);
  }

  const eof = expect(context, TokenType.EndOfFile, nameof(parse));

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
  context.logger.enter(nameof(parseTopLevelStatement));
  const token = peek(context);

  let result: Result<Statement, ParserError>;
  switch (token.type) {
    case TokenType.Var:
      result = parseVariableDeclaration(context);
      break;

    case TokenType.Func:
      result = parseFunctionDeclaration(context);
      break;

    case TokenType.Struct:
      result = parseStructDeclaration(context);
      break;

    default:
      return {
        error: createError(
          token,
          ParserErrorKind.UnknownTopLevelStatement,
          `Token type ${TokenType[token.type]} unexpected in ${nameof(parseTopLevelStatement)}`,
        ),
      };
  }

  return result;
}

function parseVariableDeclaration(context: ParserContext): Result<VariableDeclaration, ParserError> {
  context.logger.enter(nameof(parseVariableDeclaration));
  let token = expect(context, TokenType.Var, nameof(parseVariableDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = expect(context, TokenType.Colon, nameof(parseVariableDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const type = parseType(context);

  if (type.error != null) {
    return { error: type.error };
  }

  let expression: Result<Expression, ParserError> = {} as Result<Expression, ParserError>;

  if (check(context, TokenType.Equals)) {
    advance(context);
    expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }
  }

  token = expect(context, TokenType.EndStatement, nameof(parseVariableDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.VariableDeclaration,
      name: identifier.value,
      type: type.value,
      expression: expression.value!,
    },
  };
}

function parseFunctionDeclaration(context: ParserContext): Result<FunctionDeclaration, ParserError> {
  context.logger.enter(nameof(parseFunctionDeclaration));
  let token = expect(context, TokenType.Func, nameof(parseFunctionDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = expect(context, TokenType.OpenParen, nameof(parseFunctionDeclaration));

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

  token = expect(context, TokenType.CloseParen, nameof(parseFunctionDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  token = expect(context, TokenType.Colon, nameof(parseFunctionDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const returnType = parseType(context);

  if (returnType.error != null) {
    return { error: returnType.error };
  }

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
      returnType: <TypeReference>returnType.value,
    },
  };
}

function parseFunctionArgument(context: ParserContext): Result<FunctionArgument, ParserError> {
  context.logger.enter(nameof(parseFunctionArgument));

  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  const token = expect(context, TokenType.Colon, nameof(parseFunctionArgument));

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

function parseStructDeclaration(context: ParserContext): Result<StructDeclaration, ParserError> {
  context.logger.enter(nameof(parseStructDeclaration));
  let token = expect(context, TokenType.Struct, nameof(parseStructDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const identifier = parseIdentifier(context);

  if (identifier.error != null) {
    return { error: identifier.error };
  }

  token = expect(context, TokenType.OpenBrace, nameof(parseFunctionDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  const members: Array<StructMember> = [];
  while (check(context, TokenType.Identifier)) {
    const member = parseStructMember(context);

    if (member.error) {
      return { error: member.error };
    }

    members.push(<StructMember>member.value);
  }

  token = expect(context, TokenType.CloseBrace, nameof(parseFunctionDeclaration));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StructDeclaration,
      name: <Identifier>identifier.value,
      members: members,
    },
  };
}

function parseStructMember(context: ParserContext): Result<StructMember, ParserError> {
  context.logger.enter(nameof(parseStructMember));

  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  let token = expect(context, TokenType.Colon, nameof(parseStructMember));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  const type = parseIdentifier(context);

  if (type.error != null) {
    return { error: type.error };
  }

  token = expect(context, TokenType.EndStatement, nameof(parseStructMember));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StructMember,
      name: name.value!,
      type: type.value!,
    },
  };
}

function parseStatementBlock(context: ParserContext): Result<StatementBlock, ParserError> {
  context.logger.enter(nameof(parseStatementBlock));
  let token = expect(context, TokenType.OpenBrace, nameof(parseStatementBlock));

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

  token = expect(context, TokenType.CloseBrace, nameof(parseStatementBlock));

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

function parseExpressionStatement(context: ParserContext): Result<ExpressionStatement, ParserError> {
  context.logger.enter(nameof(parseExpressionStatement));
  const expression = parseExpression(context);

  if (expression.error != null) {
    return { error: expression.error };
  }

  const token = expect(context, TokenType.EndStatement, nameof(parseExpressionStatement));

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
  context.logger.enter(nameof(parseDeferStatement));
  const token = expect(context, TokenType.Defer, nameof(parseDeferStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);
  const body = parseBlockLevelStatement(context);

  if (body.error) {
    return { error: body.error };
  }

  return {
    value: {
      kind: SyntaxKind.DeferStatement,
      body: <Statement>body.value,
    },
  };
}

function parseIfStatement(context: ParserContext): Result<IfStatement, ParserError> {
  context.logger.enter(nameof(parseIfStatement));
  let token = expect(context, TokenType.If, nameof(parseIfStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  token = expect(context, TokenType.OpenParen, nameof(parseIfStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  const condition = parseExpression(context);

  if (condition.error) {
    return { error: condition.error };
  }

  token = expect(context, TokenType.CloseParen, nameof(parseIfStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  const then = parseBlockLevelStatement(context);

  if (then.error) {
    return { error: then.error };
  }

  let _else: Statement | undefined = undefined;

  if (match(context, [TokenType.Else])) {
    const elseResult = parseBlockLevelStatement(context);

    if (elseResult.error) {
      return { error: elseResult.error };
    }

    _else = elseResult.value;
  }

  return {
    value: {
      kind: SyntaxKind.IfStatement,
      condition: condition.value!,
      then: then.value!,
      else: _else,
    },
  };
}

function parseWhileStatement(context: ParserContext): Result<WhileStatement, ParserError> {
  context.logger.enter(nameof(parseWhileStatement));
  let token = expect(context, TokenType.While, nameof(parseWhileStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);
  token = expect(context, TokenType.OpenParen, nameof(parseWhileStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  const condition = parseExpression(context);

  if (condition.error) {
    return { error: condition.error };
  }

  token = expect(context, TokenType.CloseParen, nameof(parseWhileStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);

  const body = parseBlockLevelStatement(context);

  if (body.error) {
    return { error: body.error };
  }

  return {
    value: {
      kind: SyntaxKind.WhileStatement,
      condition: condition.value!,
      body: body.value!,
    },
  };
}

function parseReturnStatement(context: ParserContext): Result<ReturnStatement, ParserError> {
  context.logger.enter(nameof(parseReturnStatement));
  const token = expect(context, TokenType.Return, nameof(parseReturnStatement));

  if (token.error) {
    return { error: token.error };
  }

  advance(context);
  const expression = parseExpression(context);

  if (expression.error) {
    return { error: expression.error };
  }

  expect(context, TokenType.EndStatement, nameof(parseReturnStatement));
  advance(context);

  return {
    value: {
      kind: SyntaxKind.ReturnStatement,
      expression: <Expression>expression.value,
    },
  };
}

function parseExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseExpression));

  let result: Result<Expression, ParserError> = parseAssignmentExpression(context);

  if (result.error != null) {
    return { error: result.error };
  }

  const token = peek(context);
  if (token.type == TokenType.OpenParen) {
    result = parseCallExpression(context, <Expression>result.value);
  } else if (token.type == TokenType.OpenBracket) {
    result = parseElementAccessExpression(context, <Expression>result.value);
  } else if (token.type == TokenType.Dot) {
    result = parsePropertyAccessExpression(context, <Expression>result.value);
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

function parseAssignmentExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseAssignmentExpression));

  const startToken = peek(context);
  const expression = parseLogicalOrExpression(context);

  if (expression.error) {
    return expression;
  }

  if (match(context, ASSIGNMENT_TOKENS)) {
    const operatorToken = previous(context);
    const value = parseExpression(context);

    if (value.error) {
      return { error: value.error };
    }

    if (expression.value!.kind != SyntaxKind.Identifier) {
      return { error: createError(startToken, ParserErrorKind.InvalidAssignmentTarget, "Invalid assignment target.") };
    }

    const result: Result<AssignmentExpression, ParserError> = {
      value: {
        kind: SyntaxKind.AssignmentExpression,
        name: <Identifier>expression.value,
        operator: ASSIGNMENT_OPERATORS_MAP[operatorToken.type] as any,
        value: value.value!,
      },
    };

    return result;
  } else {
    return expression;
  }
}

function parseLogicalOrExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseLogicalOrExpression));

  let result = parseLogicalAndExpression(context);

  if (result.error) {
    return { error: result.error };
  }

  while (match(context, [TokenType.BarBar])) {
    const rhs = parseLogicalAndExpression(context);

    if (rhs.error) {
      return { error: rhs.error };
    }

    const expression: LogicalExpression = {
      kind: SyntaxKind.LogicalExpression,
      lhs: result.value,
      operator: Operator.BarBar,
      rhs: rhs.value,
    };

    result = { value: expression };
  }

  return result;
}

function parseLogicalAndExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseLogicalAndExpression));

  let result = parseEqualityExpression(context);

  if (result.error) {
    return { error: result.error };
  }

  while (match(context, [TokenType.AmpersandAmpersand])) {
    const rhs = parseEqualityExpression(context);

    if (rhs.error) {
      return { error: rhs.error };
    }

    const expression: LogicalExpression = {
      kind: SyntaxKind.LogicalExpression,
      lhs: result.value,
      operator: Operator.AmpersandAmpersand,
      rhs: rhs.value,
    };

    result = { value: expression };
  }

  return result;
}

function parseEqualityExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseEqualityExpression));

  let result = parseComparisonExpression(context);

  if (result.error != null) {
    return { error: result.error };
  }

  while (match(context, [TokenType.EqualsEquals, TokenType.ExclamationEquals])) {
    const operatorToken = previous(context);

    const rhs = parseComparisonExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    const expression: EqualityExpression = {
      kind: SyntaxKind.EqualityExpression,
      lhs: result.value,
      operator: operatorToken.type == TokenType.EqualsEquals ? Operator.EqualsEquals : Operator.ExclamationEquals,
      rhs: rhs.value,
    };

    result = { value: expression };
  }

  return result;
}

function parseComparisonExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseComparisonExpression));

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

    const result: Result<ComparisonExpression, ParserError> = {
      value: {
        kind: SyntaxKind.ComparisonExpression,
        lhs: lhs.value,
        operator,
        rhs: rhs.value,
      },
    };

    return result;
  } else {
    return lhs;
  }
}

function parseAdditiveExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseAdditiveExpression));

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
        lhs: lhs.value,
        operator: operatorToken.type == TokenType.Plus ? Operator.Plus : Operator.Minus,
        rhs: rhs.value,
      },
    };

    return result;
  } else {
    return lhs;
  }
}

function parseMultiplicativeExpression(context: ParserContext): Result<Expression, ParserError> {
  context.logger.enter(nameof(parseMultiplicativeExpression));

  const lhs = parseUnaryExpression(context);

  if (lhs.error != null) {
    return { error: lhs.error };
  }

  const operatorToken = peek(context);
  if (operatorToken.type == TokenType.Asterisk || operatorToken.type == TokenType.Slash) {
    advance(context);

    const rhs = parseUnaryExpression(context);

    if (rhs.error != null) {
      return { error: rhs.error };
    }

    const result: Result<MultiplcativeExpression, ParserError> = {
      value: {
        kind: SyntaxKind.MultiplicativeExpression,
        lhs: lhs.value,
        operator: operatorToken.type == TokenType.Asterisk ? Operator.Asterisk : Operator.Slash,
        rhs: rhs.value,
      },
    };

    return result;
  } else {
    return lhs;
  }
}

function parseUnaryExpression(context: ParserContext): Result<Expression, ParserError> {
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

    if (expression.error != null) {
      return { error: expression.error };
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

    const result: Result<UnaryExpression, ParserError> = {
      value: {
        kind: SyntaxKind.UnaryExpression,
        operator,
        expression: expression.value,
      },
    };

    return result;
  } else {
    return parsePrimaryExpression(context);
  }
}

function parsePrimaryExpression(context: ParserContext): Result<Expression, ParserError> {
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
      return {
        error: createError(
          token,
          ParserErrorKind.UnknownExpression,
          `Token type ${TokenType[token.type]} unexpected in ${nameof(parsePrimaryExpression)}`,
        ),
      };
  }

  return result;
}

function parseParenthesizedExpression(context: ParserContext): Result<ParenthesizedExpression, ParserError> {
  context.logger.enter(nameof(parseParenthesizedExpression));

  const openParenToken = expect(context, TokenType.OpenParen, nameof(parseParenthesizedExpression));

  if (openParenToken.error != null) {
    return { error: openParenToken.error };
  }

  advance(context);
  const expression = parseExpression(context);

  if (expression.error != null) {
    return { error: expression.error };
  }

  const closeParenToken = expect(context, TokenType.CloseParen, nameof(parseParenthesizedExpression));

  if (closeParenToken.error != null) {
    return { error: closeParenToken.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ParenthesizedExpression,
      expression: expression.value,
    },
  };
}

function parseCallExpression(context: ParserContext, expression: Expression): Result<CallExpression, ParserError> {
  context.logger.enter(nameof(parseCallExpression));
  let token = expect(context, TokenType.OpenParen, nameof(parseCallExpression));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const args = parseCallExpressionArguments(context);

  if (args.error != null) {
    return { error: args.error };
  }

  token = expect(context, TokenType.CloseParen, nameof(parseCallExpression));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.CallExpression,
      expression,
      arguments: args.value,
    },
  };
}

function parseElementAccessExpression(
  context: ParserContext,
  expression: Expression,
): Result<ElementAccessExpression, ParserError> {
  context.logger.enter(nameof(parseElementAccessExpression));
  let token = expect(context, TokenType.OpenBracket, nameof(parseElementAccessExpression));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const argumentExpression = parseExpression(context);

  if (argumentExpression.error != null) {
    return { error: argumentExpression.error };
  }

  token = expect(context, TokenType.CloseBracket, nameof(parseElementAccessExpression));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ElementAccessExpression,
      expression,
      argumentExpression: argumentExpression.value,
    },
  };
}

function parsePropertyAccessExpression(
  context: ParserContext,
  expression: Expression,
): Result<PropertyAccessExpression, ParserError> {
  context.logger.enter(nameof(parsePropertyAccessExpression));
  let token = expect(context, TokenType.Dot, nameof(parsePropertyAccessExpression));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);
  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  return {
    value: {
      kind: SyntaxKind.PropertyAccessExpression,
      expression,
      name: name.value,
    },
  };
}

function parseCallExpressionArguments(context: ParserContext): Result<Array<Expression>, ParserError> {
  context.logger.enter(nameof(parseCallExpressionArguments));
  const args: Array<Expression> = [];

  let token = peek(context);
  while (!isEOF(context) && token.type != TokenType.CloseParen) {
    token = peek(context);

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    args.push(expression.value);
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

function parseType(context: ParserContext): Result<TypeNode, ParserError> {
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

function parsePointerType(context: ParserContext): Result<PointerType, ParserError> {
  context.logger.enter(nameof(parsePointerType));

  const expected = expect(context, TokenType.Asterisk, nameof(parsePointerType));

  if (expected.error) {
    return { error: expected.error };
  }

  advance(context);

  const elementType = parseType(context);

  if (elementType.error) {
    return { error: elementType.error };
  }

  return {
    value: {
      kind: SyntaxKind.PointerType,
      elementType: elementType.value,
    },
  };
}

function parseArrayType(context: ParserContext): Result<ArrayType, ParserError> {
  context.logger.enter(nameof(parseArrayType));

  let expected = expect(context, TokenType.OpenBracket, nameof(parseArrayType));

  if (expected.error) {
    return { error: expected.error };
  }

  advance(context);
  expected = expect(context, TokenType.CloseBracket, nameof(parseArrayType));

  if (expected.error) {
    return { error: expected.error };
  }

  advance(context);

  const elementType = parseType(context);

  if (elementType.error) {
    return { error: elementType.error };
  }

  return {
    value: {
      kind: SyntaxKind.ArrayType,
      elementType: elementType.value,
    },
  };
}

function parseTypeReference(context: ParserContext): Result<TypeReference, ParserError> {
  context.logger.enter(nameof(parseTypeReference));

  const name = parseIdentifier(context);

  if (name.error != null) {
    return { error: name.error };
  }

  return {
    value: {
      kind: SyntaxKind.TypeReference,
      name: name.value,
    },
  };
}

function parseIdentifier(context: ParserContext): Result<Identifier, ParserError> {
  context.logger.enter(nameof(parseIdentifier));

  const token = expect(context, TokenType.Identifier, nameof(parseIdentifier));

  if (token.error != null) {
    return { error: token.error };
  }

  if (token.value.text == null) {
    return {
      error: createError(
        token.value,
        ParserErrorKind.TokenTextIsNull,
        `Expected token to have text value in ${nameof(parseIdentifier)}.`,
      ),
    };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.Identifier,
      value: token.value.text,
    },
  };
}

function parseStructLiteral(context: ParserContext): Result<StructLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));

  let expectedToken = expect(context, TokenType.OpenBrace, nameof(parseStructLiteral));

  if (expectedToken.error != null) {
    return { error: expectedToken.error };
  }

  advance(context);

  const elements: StructLiteralElement[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBrace) {
    if (elements.length > 0) {
      expectedToken = expect(context, TokenType.Comma, nameof(parseStructLiteral));

      if (expectedToken.error != null) {
        return { error: expectedToken.error };
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

      if (identifier.error) {
        return { error: identifier.error };
      }

      name = identifier.value;

      expectedToken = expect(context, TokenType.Colon, nameof(parseStructLiteral));

      if (expectedToken.error != null) {
        return { error: expectedToken.error };
      }

      advance(context);
    }

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    elements.push({
      kind: SyntaxKind.StructLiteralElement,
      name: name,
      expression: expression.value,
    });

    token = peek(context);
  }

  expectedToken = expect(context, TokenType.CloseBrace, nameof(parseStructLiteral));

  if (expectedToken.error != null) {
    return { error: expectedToken.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StructLiteral,
      elements: elements,
    },
  };
}

function parseArrayLiteral(context: ParserContext): Result<ArrayLiteral, ParserError> {
  context.logger.enter(nameof(parseArrayLiteral));

  let expectedToken = expect(context, TokenType.OpenBracket, nameof(parseArrayLiteral));

  if (expectedToken.error != null) {
    return { error: expectedToken.error };
  }

  advance(context);

  const elements: Expression[] = [];
  let token = peek(context);
  while (token.type != TokenType.CloseBracket) {
    if (elements.length > 0) {
      expectedToken = expect(context, TokenType.Comma, nameof(parseArrayLiteral));

      if (expectedToken.error != null) {
        return { error: expectedToken.error };
      }

      advance(context);

      // Handle hanging commas
      token = peek(context);
      if (token.type == TokenType.CloseBracket) {
        break;
      }
    }

    const expression = parseExpression(context);

    if (expression.error != null) {
      return { error: expression.error };
    }

    elements.push(expression.value);

    token = peek(context);
  }

  expectedToken = expect(context, TokenType.CloseBracket, nameof(parseArrayLiteral));

  if (expectedToken.error != null) {
    return { error: expectedToken.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.ArrayLiteral,
      elements,
    },
  };
}

function parseBoolLiteral(context: ParserContext): Result<BooleanLiteral, ParserError> {
  context.logger.enter(nameof(parseBoolLiteral));
  const token = expect(context, [TokenType.True, TokenType.False], nameof(parseBoolLiteral));

  if (token.error != null) {
    return { error: token.error };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.BooleanLiteral,
      value: token.value.type == TokenType.True,
    },
  };
}

function parseIntegerLiteral(context: ParserContext): Result<IntegerLiteral, ParserError> {
  context.logger.enter(nameof(parseIntegerLiteral));
  const token = expect(context, TokenType.Integer, nameof(parseIntegerLiteral));

  if (token.error != null) {
    return { error: token.error };
  }

  if (token.value.text == null) {
    return {
      error: createError(
        token.value,
        ParserErrorKind.TokenTextIsNull,
        `Expected token to have text value in ${nameof(parseIntegerLiteral)}.`,
      ),
    };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.IntegerLiteral,
      value: token.value.text,
    },
  };
}

function parseStringLiteral(context: ParserContext): Result<StringLiteral, ParserError> {
  context.logger.enter(nameof(parseStringLiteral));
  const token = expect(context, TokenType.String, nameof(parseIntegerLiteral));

  if (token.error != null) {
    return { error: token.error };
  }

  if (token.value.text == null) {
    return {
      error: createError(
        token.value,
        ParserErrorKind.TokenTextIsNull,
        `Expected token to have text value in ${nameof(parseStringLiteral)}.`,
      ),
    };
  }

  advance(context);

  return {
    value: {
      kind: SyntaxKind.StringLiteral,
      value: token.value.text,
    },
  };
}
