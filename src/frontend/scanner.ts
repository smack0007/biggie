import { char, int } from "../shims.ts";

export enum TokenType {
  // Used internally to indicate we're currently looking for a token.
  Unknown = -1,

  // Used to indicate the end of a list of tokens.
  EOF,

  // &
  Ampersand,

  // &&
  AmpersandAmpersand,

  // *
  Asterisk,

  // *=
  AsteriskEquals,

  // |
  Bar,

  // ||
  BarBar,

  // '
  Char,

  // }
  CloseBrace,

  // ]
  CloseBracket,

  // )
  CloseParen,

  // ;
  Colon,

  // ,
  Comma,

  // defer
  Defer,

  // .
  Dot,

  // else
  Else,

  // enum
  Enum,

  // =
  Equals,

  // ==
  EqualsEquals,

  // !
  Exclamation,

  // !=
  ExclamationEquals,

  // export
  Export,

  // false
  False,

  // float literal
  Float,

  // for
  For,

  // func
  Func,

  // >
  GreaterThan,

  // >=
  GreaterThanEqual,

  // <identifier>
  Identifier,

  // if
  If,

  // import
  Import,

  // integer literal
  Integer,

  // <
  LessThan,

  // <=
  LessThanEqual,

  // -
  Minus,

  // -=
  MinusEquals,

  // null
  Null,

  // numeric literal
  Numeric,

  // {
  OpenBrace,

  // [
  OpenBracket,

  // (
  OpenParen,

  // +
  Plus,

  // +=
  PlusEquals,

  // return
  Return,

  // ;
  Semicolon,

  // /
  Slash,

  // /=
  SlashEquals,

  // string literal
  String,

  // struct
  Struct,

  // true
  True,

  // var
  Var,

  // while
  While,
}

export interface TextPosition {
  line: int;
  column: int;
}

export interface Token {
  type: TokenType;
  text: string | null;
  pos: TextPosition;
}

function isDigit(ch: char): boolean {
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
  return ch.toUpperCase() != ch.toLowerCase() || <number> ch.codePointAt(0) > 127;
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
        // Skip over whitespace
        if (text[i] == "\n") {
          curLine += 1;
          curColumn = 0;
        }

        continue;
      } else if (text[i] == "'") {
        // Start of a char
        type = TokenType.Char;
      } else if (text[i] == '"') {
        // Start of a string
        type = TokenType.String;
      } else if (text[i] == ";") {
        // End Statement
        token.push({ type: TokenType.Semicolon, text: null, pos: { line, column } });
      } else if (text[i] == ".") {
        // Period
        token.push({ type: TokenType.Dot, text: null, pos: { line, column } });
      } else if (text[i] == ",") {
        // Period
        token.push({ type: TokenType.Comma, text: null, pos: { line, column } });
      } else if (text[i] == "(") {
        // OpenParen
        token.push({ type: TokenType.OpenParen, text: null, pos: { line, column } });
      } else if (text[i] == ")") {
        // CloseParen
        token.push({ type: TokenType.CloseParen, text: null, pos: { line, column } });
      } else if (text[i] == "[") {
        // OpenBracket
        token.push({ type: TokenType.OpenBracket, text: null, pos: { line, column } });
      } else if (text[i] == "]") {
        // CloseBracket
        token.push({ type: TokenType.CloseBracket, text: null, pos: { line, column } });
      } else if (text[i] == "{") {
        // OpenBrace
        token.push({ type: TokenType.OpenBrace, text: null, pos: { line, column } });
      } else if (text[i] == "}") {
        // CloseBrace
        token.push({ type: TokenType.CloseBrace, text: null, pos: { line, column } });
      } else if (text[i] == ":") {
        token.push({ type: TokenType.Colon, text: null, pos: { line, column } });
      } else if (text[i] == "=") {
        // Gets or EqualTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.EqualsEquals, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.Equals, text: null, pos: { line, column } });
        }
      } else if (text[i] == "!") {
        // Not or NotEqualTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.ExclamationEquals, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.Exclamation, text: null, pos: { line, column } });
        }
      } else if (text[i] == ">") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.GreaterThanEqual, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.GreaterThan, text: null, pos: { line, column } });
        }
      } else if (text[i] == "<") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.LessThanEqual, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.LessThan, text: null, pos: { line, column } });
        }
      } else if (text[i] == "+") {
        // Plus or PlusGets
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.PlusEquals, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          token.push({ type: TokenType.Plus, text: null, pos: { line, column } });
        }
      } else if (text[i] == "-") {
        // Minus or MinusGets
        if (i + 1 < text.length && !isWhitespace(text[i + 1])) {
          if (text[i + 1] == "=") {
            token.push({ type: TokenType.MinusEquals, text: null, pos: { line, column } });
            i += 1;
            curColumn += 1;
          } else if (isDigit(text[i + 1])) {
            type = TokenType.Numeric;
            value += "-";
            value += text[i + 1];
            i += 1;
            curColumn += 1;
          } else {
            token.push({ type: TokenType.Minus, text: null, pos: { line, column } });
          }
        } else {
          token.push({ type: TokenType.Minus, text: null, pos: { line, column } });
        }
      } else if (text[i] == "*") {
        // Multiply or MultiplyGets
        if (i + 1 < text.length && text[i + 1] != "=") {
          token.push({ type: TokenType.Asterisk, text: null, pos: { line, column } });
        } else {
          token.push({ type: TokenType.AsteriskEquals, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        }
      } else if (text[i] == "/") {
        // Divide or DivideGets or Comments
        if (i + 1 < text.length && text[i + 1] == "=") {
          token.push({ type: TokenType.SlashEquals, text: null, pos: { line, column } });
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
          token.push({ type: TokenType.Slash, text: null, pos: { line, column } });
        }
      } else if (text[i] == "&") {
        if (i + 1 < text.length && text[i + 1] == "&") {
          // &&
          token.push({ type: TokenType.AmpersandAmpersand, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          // &
          token.push({ type: TokenType.Ampersand, text: null, pos: { line, column } });
        }
      } else if (text[i] == "|") {
        // LogicalOr or ClosePipeBracket
        if (i + 1 < text.length && text[i + 1] == "|") {
          // ||
          token.push({ type: TokenType.BarBar, text: null, pos: { line, column } });
          i += 1;
          curColumn += 1;
        } else {
          // |
          token.push({ type: TokenType.Bar, text: null, pos: { line, column } });
        }
      } else if (isLetter(text[i]) || text[i] == "_") {
        // Identifier
        type = TokenType.Identifier;
        value += text[i];
      } else if (isDigit(text[i])) {
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
      if (isLetter(text[i]) || isDigit(text[i]) || text[i] == "_") {
        value += text[i];
      } else {
        output = true;
        i -= 1;
        curColumn -= 1;
      }
    } else if (type == TokenType.Numeric) {
      // We're inside a numeric
      if (isDigit(text[i])) {
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
          case "defer":
            token.push({ type: TokenType.Defer, text: null, pos: { line, column } });
            break;

          case "else":
            token.push({ type: TokenType.Else, text: null, pos: { line, column } });
            break;

          case "enum":
            token.push({ type: TokenType.Enum, text: null, pos: { line, column } });
            break;

          case "export":
            token.push({ type: TokenType.Export, text: null, pos: { line, column } });
            break;

          case "false":
            token.push({ type: TokenType.False, text: null, pos: { line, column } });
            break;

          case "for":
            token.push({ type: TokenType.For, text: null, pos: { line, column } });
            break;

          case "func":
            token.push({ type: TokenType.Func, text: null, pos: { line, column } });
            break;

          case "if":
            token.push({ type: TokenType.If, text: null, pos: { line, column } });
            break;

          case "import":
            token.push({ type: TokenType.Import, text: null, pos: { line, column } });
            break;

          case "null":
            token.push({ type: TokenType.Null, text: null, pos: { line, column } });
            break;

          case "return":
            token.push({ type: TokenType.Return, text: null, pos: { line, column } });
            break;

          case "struct":
            token.push({ type: TokenType.Struct, text: null, pos: { line, column } });
            break;

          case "true":
            token.push({ type: TokenType.True, text: null, pos: { line, column } });
            break;

          case "var":
            token.push({ type: TokenType.Var, text: null, pos: { line, column } });
            break;

          case "while":
            token.push({ type: TokenType.While, text: null, pos: { line, column } });
            break;

          default:
            token.push({ type, text: value, pos: { line, column } });
            break;
        }
      } else if (type == TokenType.Numeric) {
        if (isFloatingPoint) {
          type = TokenType.Float;
        } else {
          type = TokenType.Integer;
        }

        token.push({ type: type, text: value, pos: { line, column } });
      } else if (type == TokenType.Char) {
        token.push({ type: type, text: value, pos: { line, column } });
      } else if (type == TokenType.String) {
        token.push({ type: type, text: value, pos: { line, column } });
      }

      output = false;
      type = TokenType.Unknown;
      isFloatingPoint = false;
      value = "";
    }
  }

  if (type == TokenType.Unknown) {
    // Add an EOF to mark the end of the script.
    token.push({ type: TokenType.EOF, text: null, pos: { line, column } });
  }

  return token;
}
