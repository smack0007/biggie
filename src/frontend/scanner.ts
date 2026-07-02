import * as assert from "../assert.ts";
import { char } from "../shims.ts";
import { TextPosition } from "./ast/mod.ts";

export enum TokenType {
  // Used to indicate the end of a list of tokens.
  EOF = 0,

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

export function scan(input: string): Array<Token> {
  // TODO: Don't know why we need 2 newlines here but otherwise
  // some edge cases don't work.
  input += "\n\n"; // Ensure new line at EOF

  const tokens: Array<Token> = [];

  let output = false; // If true, write the token.
  let type: TokenType | null = null;
  let text = ""; // The current value of the token.

  let line = 0,
    column = 0; // Current position of the token being parsed.
  let curLine = 1,
    curColumn = 0; // Current position of parsing.

  function pushToken(type: TokenType, text?: string): void {
    tokens.push({ type, text: text ?? null, pos: { line, column } });
  }

  for (let i = 0; i < input.length - 1; i += 1) {
    curColumn += 1;

    if (type == null) {
      // We're looking for a token
      line = curLine;
      column = curColumn;

      if (isWhitespace(input[i])) {
        // Skip over whitespace
        if (input[i] == "\n") {
          curLine += 1;
          curColumn = 0;
        }

        continue;
      } else if (input[i] == "'") {
        // Start of a char
        type = TokenType.Char;
      } else if (input[i] == '"') {
        // Start of a string
        type = TokenType.String;
      } else if (input[i] == ";") {
        pushToken(TokenType.Semicolon);
      } else if (input[i] == ".") {
        pushToken(TokenType.Dot);
      } else if (input[i] == ",") {
        pushToken(TokenType.Comma);
      } else if (input[i] == "(") {
        pushToken(TokenType.OpenParen);
      } else if (input[i] == ")") {
        pushToken(TokenType.CloseParen);
      } else if (input[i] == "[") {
        pushToken(TokenType.OpenBracket);
      } else if (input[i] == "]") {
        pushToken(TokenType.CloseBracket);
      } else if (input[i] == "{") {
        pushToken(TokenType.OpenBrace);
      } else if (input[i] == "}") {
        pushToken(TokenType.CloseBrace);
      } else if (input[i] == ":") {
        pushToken(TokenType.Colon);
      } else if (input[i] == "=") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.EqualsEquals);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Equals);
        }
      } else if (input[i] == "!") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.ExclamationEquals);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Exclamation);
        }
      } else if (input[i] == ">") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.GreaterThanEqual);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.GreaterThan);
        }
      } else if (input[i] == "<") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.LessThanEqual);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.LessThan);
        }
      } else if (input[i] == "+") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.PlusEquals);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Plus);
        }
      } else if (input[i] == "-") {
        if (i + 1 < input.length && !isWhitespace(input[i + 1])) {
          if (input[i + 1] == "=") {
            pushToken(TokenType.MinusEquals);
            i += 1;
            curColumn += 1;
          } else if (isDigit(input[i + 1])) {
            type = TokenType.Integer;
            text += "-";
            text += input[i + 1];
            i += 1;
            curColumn += 1;
          } else {
            pushToken(TokenType.Minus);
          }
        } else {
          pushToken(TokenType.Minus);
        }
      } else if (input[i] == "*") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.AsteriskEquals);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Asterisk);
        }
      } else if (input[i] == "/") {
        if (i + 1 < input.length && input[i + 1] == "=") {
          pushToken(TokenType.SlashEquals);
          i++;
        } else if (i + 1 < input.length && input[i + 1] == "/") {
          // Single line comment
          i += 2;
          curColumn += 2;
          while (i < input.length && input[i] != "\n") i++;
        } else if (i + 1 < input.length && input[i + 1] == "*") {
          // Multi line comment
          i += 2;
          curColumn += 2;
          while (i < input.length) {
            if (input[i] == "*" && i + 1 < input.length && input[i + 1] == "/") {
              i++;
              break;
            }

            i += 1;
            curColumn += 1;
          }
        } else {
          pushToken(TokenType.Slash);
        }
      } else if (input[i] == "&") {
        if (i + 1 < input.length && input[i + 1] == "&") {
          pushToken(TokenType.AmpersandAmpersand);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Ampersand);
        }
      } else if (input[i] == "|") {
        if (i + 1 < input.length && input[i + 1] == "|") {
          pushToken(TokenType.BarBar);
          i += 1;
          curColumn += 1;
        } else {
          pushToken(TokenType.Bar);
        }
      } else if (isLetter(input[i]) || input[i] == "_") {
        type = TokenType.Identifier;
        text += input[i];
      } else if (isDigit(input[i])) {
        type = TokenType.Integer;
        text += input[i];
      }
    } else if (type == TokenType.Char) {
      if (input[i] != "'") {
        text += input[i];
      } else if (input[i - 1] == "\\") {
        text += input[i];
      } else {
        output = true;
      }
    } else if (type == TokenType.String) {
      if (input[i] != '"') {
        text += input[i];
      } else if (input[i - 1] == "\\") {
        text += input[i];
      } else {
        output = true;
      }
    } else if (type == TokenType.Identifier) {
      if (isLetter(input[i]) || isDigit(input[i]) || input[i] == "_") {
        text += input[i];
      } else {
        output = true;
        i -= 1;
        curColumn -= 1;
      }
    } else if (type == TokenType.Integer || type == TokenType.Float) {
      if (isDigit(input[i])) {
        text += input[i];
      } else if (input[i] == ".") {
        type = TokenType.Float;
        text += input[i];
      } else {
        output = true;
        i -= 1;
        curColumn -= 1;
      }
    }

    if (output) {
      // We've reached the end of a long token
      if (type == TokenType.Identifier) {
        switch (text) {
          case "defer":
            type = TokenType.Defer;
            break;
          case "else":
            type = TokenType.Else;
            break;
          case "enum":
            type = TokenType.Enum;
            break;
          case "export":
            type = TokenType.Export;
            break;
          case "false":
            type = TokenType.False;
            break;
          case "for":
            type = TokenType.For;
            break;
          case "func":
            type = TokenType.Func;
            break;
          case "if":
            type = TokenType.If;
            break;
          case "import":
            type = TokenType.Import;
            break;
          case "null":
            type = TokenType.Null;
            break;
          case "return":
            type = TokenType.Return;
            break;
          case "struct":
            type = TokenType.Struct;
            break;
          case "true":
            type = TokenType.True;
            break;
          case "var":
            type = TokenType.Var;
            break;
          case "while":
            type = TokenType.While;
            break;
        }
      }

      assert.notNull(type, "type not expected to be null");
      pushToken(type, text);

      output = false;
      type = null;
      text = "";
    }
  }

  // Add an EOF to mark the end of the script.
  pushToken(TokenType.EOF);

  return tokens;
}
