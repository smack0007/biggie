import { char, int } from "../shims";

export enum TokenType {
  // Used internally to indicate we're currently looking for a token.
  Unknown = 0,

  // Whitespace
  Whitespace,

  // 'c'.
  Char,

  // "String".
  String,

  // Identifier
  Identifier,

  // import
  Import,

  // func
  Func,

  // defer
  Defer,

  // return
  Return,

  // if
  If,

  // else
  Else,

  // while
  While,

  // for
  For,

  // of
  Of,

  // null
  Null,

  // true
  True,

  // false
  False,

  // Unidentified numeric value. This should not be output.
  Numeric,

  // Integer value, i.e. "123".
  Integer,

  // Float value, i.e. "123.456f".
  Float,

  // Float value, i.e. "123.456".
  Double,

  // ;
  EndStatement,

  // const
  Const,

  // let
  Let,

  // .
  Dot,

  // ,
  Comma,

  // (
  OpenParen,

  // )
  CloseParen,

  // [
  OpenBracket,

  // ]
  CloseBracket,

  // {
  OpenBrace,

  // }
  CloseBrace,

  // :
  Colon,

  // =
  Assignment,

  // !
  LogicalNot,

  // ==
  EqualTo,

  // !=
  NotEqualTo,

  // >
  GreaterThan,

  // >=
  GreaterThanOrEqualTo,

  // <
  LessThan,

  // <=
  LessThanOrEqualTo,

  // +
  Plus,

  // +=
  PlusGets,

  // -
  Minus,

  // -=
  MinusGets,

  // *
  Multiply,

  // *=
  MultiplyGets,

  // /
  Divide,

  // /=
  DivideGets,

  // &&
  LogicalAnd,

  // ||
  LogicalOr,

  // Used to indicate the end of a list of tokens.
  EOF,
}

export interface Token {
  type: TokenType;
  text: string | null;
  line: int;
  column: int;
}

function isNumber(ch: char): boolean {
  return (
    ch == "0" ||
    ch == "1" ||
    ch == "2" ||
    ch == "3" ||
    ch == "4" ||
    ch == "5" ||
    ch == "6" ||
    ch == "7" ||
    ch == "8" ||
    ch == "9"
  );
}

function isWhitespace(ch: char): boolean {
  return ch == " " || ch == "\t" || ch == "\r" || ch == "\n";
}

function isLetter(ch: char): boolean {
  return ch.toUpperCase() != ch.toLowerCase() || <number>ch.codePointAt(0) > 127;
}

export function scan(text: string): Array<Token> {
  text += "\n"; // Ensure new line at EOF

  const token: Array<Token> = [];

  let output = false; // If true, write the token.
  let value = ""; // The current value of the token.
  let type = TokenType.Unknown;
  let isFloatingPoint = false; // For parsing numbers

  let line = 0,
    column = 0; // Current position of the token being parsed.
  let curLine = 1,
    curColumn = 0; // Current position of parsing.

  for (let i = 0; i < text.length - 1; i += 1) {
    curColumn += 1;

    if (type == TokenType.Unknown) {
      // We're looking for a token
      line = curLine;
      column = curColumn;

      if (isWhitespace(text[i])) {
        while (i < text.length - 1 && isWhitespace(text[i + 1])) {
          value += text[i];
          i += 1;
          curColumn += 1;

          if (text[i] == "\n") {
            curLine += 1;
            curColumn = 0;
          }
        }

        token.push({ type: TokenType.Whitespace, text: value, line: line, column: column });
        value = "";
        continue;
      } else if (text[i] == "'") {
        // Start of a char
        type = TokenType.Char;
      } else if (text[i] == '"') {
        // Start of a string
        type = TokenType.String;
      } else if (text[i] == ";") {
        // End Statement
        token.push({ type: TokenType.EndStatement, text: null, line: line, column: column });
      } else if (text[i] == ".") {
        // Period
        token.push({ type: TokenType.Dot, text: null, line: line, column: column });
      } else if (text[i] == ",") {
        // Period
        token.push({ type: TokenType.Comma, text: null, line: line, column: column });
      } else if (text[i] == "(") {
        // OpenParen
        token.push({ type: TokenType.OpenParen, text: null, line: line, column: column });
      } else if (text[i] == ")") {
        // CloseParen
        token.push({ type: TokenType.CloseParen, text: null, line: line, column: column });
      } else if (text[i] == "[") {
        // OpenBracket
        token.push({ type: TokenType.OpenBracket, text: null, line: line, column: column });
      } else if (text[i] == "]") {
        // CloseBracket
        token.push({ type: TokenType.CloseBracket, text: null, line: line, column: column });
      } else if (text[i] == "{") {
        // OpenBrace
        token.push({ type: TokenType.OpenBrace, text: null, line: line, column: column });
      } else if (text[i] == "}") {
        // CloseBrace
        token.push({ type: TokenType.CloseBrace, text: null, line: line, column: column });
      } else if (text[i] == ":") {
        token.push({ type: TokenType.Colon, text: null, line: line, column: column });
      } else if (text[i] == "=") {
        // Gets or EqualTo or MapsTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.EqualTo, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.Assignment, text: null, line: line, column: column });
        }
      } else if (text[i] == "!") {
        // Not or NotEqualTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.NotEqualTo, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.LogicalNot, text: null, line: line, column: column });
        }
      } else if (text[i] == ">") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.GreaterThanOrEqualTo, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.GreaterThan, text: null, line: line, column: column });
        }
      } else if (text[i] == "<") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.LessThanOrEqualTo, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.LessThan, text: null, line: line, column: column });
        }
      } else if (text[i] == "+") {
        // Plus or PlusGets
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.PlusGets, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.Plus, text: null, line: line, column: column });
        }
      } else if (text[i] == "-") {
        // Minus or MinusGets
        if (i + 1 < text.length && !isWhitespace(text[i + 1])) {
          if (text[i + 1] == "=") {
            token.push({ type: TokenType.MinusGets, text: null, line: line, column: column });
            i += 1;
            curColumn += 1;
          } else if (isNumber(text[i + 1])) {
            type = TokenType.Numeric;
            value += "-";
            value += text[i + 1];
            i += 1;
            curColumn += 1;
          } else {
            token.push({ type: TokenType.Minus, text: null, line: line, column: column });
          }
        } else {
          token.push({ type: TokenType.Minus, text: null, line: line, column: column });
        }
      } else if (text[i] == "*") {
        // Multiply or MultiplyGets
        if (i + 1 < text.length && text[i + 1] != "=") {
          token.push({ type: TokenType.Multiply, text: null, line: line, column: column });
        } else {
          token.push({ type: TokenType.MultiplyGets, text: null, line: line, column: column });
          i += 1;
          curColumn += 1;
        }
      } else if (text[i] == "/") {
        // Divide or DivideGets or Comments
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.DivideGets, text: null, line: line, column: column });
          i++;
        } else if (i + 1 < text.length && text[i + 1] == "/") {
          // Single line comment
          i += 2;
          curColumn += 2;
          while (i < text.length && text[i] != "\n") i++;
        } else if (i + 1 < text.length && text[i + 1] == "*") {
          // Multi line comment
          i += 2;
          curColumn += 2;
          while (i < text.length) {
            if (text[i] == "*" && i + 1 < text.length && text[i + 1] == "/") {
              i++;
              break;
            }

            i += 1;
            curColumn += 1;
          }
        } else {
          token.push({ type: TokenType.Divide, text: null, line: line, column: column });
        }
      } else if (text[i] == "&" && i + 1 < text.length && text[i + 1] == "&") {
        // And
        token.push({ type: TokenType.LogicalAnd, text: null, line: line, column: column });
        i += 1;
        curColumn += 1;
      } else if (text[i] == "|") {
        // LogicalOr or ClosePipeBracket
        if (i + 1 < text.length) {
          if (text[i + 1] == "|") {
            token.push({ type: TokenType.LogicalOr, text: null, line: line, column: column });
            i += 1;
            curColumn += 1;
          }
        }
      } else if (isLetter(text[i]) || text[i] == "_") {
        // Identifier
        type = TokenType.Identifier;
        value += text[i];
      } else if (isNumber(text[i])) {
        // Numeric
        type = TokenType.Numeric;
        value += text[i];
      }
    } else if (type == TokenType.Char) {
      // We're inside a char

      if (text[i] != "'") {
        value += text[i];
      } else if (text[i - 1] == "\\") {
        value += text[i];
      } else {
        output = true;
      }
    } else if (type == TokenType.String) {
      // We're inside a string

      if (text[i] != '"') {
        value += text[i];
      } else if (text[i - 1] == "\\") {
        value += text[i];
      } else {
        output = true;
      }
    } else if (type == TokenType.Identifier) {
      // We're inside an identifier
      if (isLetter(text[i]) || isNumber(text[i]) || text[i] == "_") {
        value += text[i];
      } else {
        output = true;
        i -= 1;
        curColumn -= 1;
      }
    } else if (type == TokenType.Numeric) {
      // We're inside a numeric
      if (isNumber(text[i])) {
        value += text[i];
      } else if (text[i] == ".") {
        isFloatingPoint = true;
        value += text[i];
      } else {
        output = true;
        i -= 1;
        curColumn -= 1;
      }
    }

    if (output) {
      // We've reached the end of a long token
      if (type == TokenType.Identifier) {
        switch (value) {
          case "import":
            token.push({ type: TokenType.Import, text: null, line: line, column: column });
            break;

          case "const":
            token.push({ type: TokenType.Const, text: null, line: line, column: column });
            break;

          case "let":
            token.push({ type: TokenType.Let, text: null, line: line, column: column });
            break;

          case "func":
            token.push({ type: TokenType.Func, text: null, line: line, column: column });
            break;

          case "defer":
            token.push({ type: TokenType.Defer, text: null, line: line, column: column });
            break;

          case "return":
            token.push({ type: TokenType.Return, text: null, line: line, column: column });
            break;

          case "if":
            token.push({ type: TokenType.If, text: null, line: line, column: column });
            break;

          case "else":
            token.push({ type: TokenType.Else, text: null, line: line, column: column });
            break;

          case "while":
            token.push({ type: TokenType.While, text: null, line: line, column: column });
            break;

          case "for":
            token.push({ type: TokenType.For, text: null, line: line, column: column });
            break;

          case "of":
            token.push({ type: TokenType.Of, text: null, line: line, column: column });
            break;

          case "null":
            token.push({ type: TokenType.Null, text: null, line: line, column: column });
            break;

          case "true":
            token.push({ type: TokenType.True, text: null, line: line, column: column });
            break;

          case "false":
            token.push({ type: TokenType.False, text: null, line: line, column: column });
            break;

          default:
            token.push({ type: type, text: value, line: line, column: column });
            break;
        }
      } else if (type == TokenType.Numeric) {
        if (isFloatingPoint) {
          if (i + 1 < text.length && text[i + 1] == "f") {
            type = TokenType.Float;
            i += 1;
            curColumn += 1;
          } else {
            type = TokenType.Double;
          }
        } else {
          type = TokenType.Integer;
        }

        token.push({ type: type, text: value, line: line, column: column });
      } else if (type == TokenType.Char) {
        token.push({ type: type, text: value, line: line, column: column });
      } else if (type == TokenType.String) {
        token.push({ type: type, text: value, line: line, column: column });
      }

      output = false;
      type = TokenType.Unknown;
      isFloatingPoint = false;
      value = "";
    }
  }

  if (type == TokenType.Unknown) {
    // Add an EOF to mark the end of the script.
    token.push({ type: TokenType.EOF, text: null, line: line, column: column });
  }

  return token;
}
