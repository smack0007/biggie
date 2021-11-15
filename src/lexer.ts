import { char, int } from "./shims";

export enum LexemeType {
  // Used internally to indicate we're currently looking for a lexeme.
  Unknown = 0,

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

  // &lt;
  LessThan,

  // &lt;=
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

  // Used to indicate the end of a list of Lexemes.
  EOF,
}

export interface Lexeme {
  type: LexemeType;
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

export function lex(text: string): Array<Lexeme> {
  text += "\n"; // Ensure new line at EOF

  const lexemes: Array<Lexeme> = [];

  let output = false; // If true, write the lexeme.
  let value = ""; // The current value of the lexeme.
  let type = LexemeType.Unknown;
  let isFloatingPoint = false; // For parsing numbers

  let line = 1,
    column = 1; // Current position of the lexeme being parsed.
  let curLine = 1,
    curColumn = 1; // Current position of parsing.

  for (let i = 0; i < text.length - 1; i += 1, curColumn += 1) {
    if (text[i] == "\n") {
      curLine++;
      curColumn = 1;
    }

    if (type == LexemeType.Unknown) { 
      // We're looking for a lexeme
      line = curLine;
      column = curColumn;

      if (isWhitespace(text[i])) {
        // Skip over white space
        continue;
      } else if (text[i] == "'") {
        // Start of a string
        type = LexemeType.Char;
      } else if (text[i] == '"') {
        // Start of a magic string
        type = LexemeType.String;
      } else if (text[i] == ";") {
        // End Statement
        lexemes.push({ type: LexemeType.EndStatement, text: null, line: curLine, column: curColumn });
      } else if (text[i] == ".") {
        // Period
        lexemes.push({ type: LexemeType.Dot, text: null, line: curLine, column: curColumn });
      } else if (text[i] == ",") {
        // Period
        lexemes.push({ type: LexemeType.Comma, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "(") {
        // OpenParen
        lexemes.push({ type: LexemeType.OpenParen, text: null, line: curLine, column: curColumn });
      } else if (text[i] == ")") {
        // CloseParen
        lexemes.push({ type: LexemeType.CloseParen, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "[") {
        // OpenBracket
        lexemes.push({ type: LexemeType.OpenBracket, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "]") {
        // CloseBracket
        lexemes.push({ type: LexemeType.CloseBracket, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "{") {
        // OpenBrace
        lexemes.push({ type: LexemeType.OpenBrace, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "}") {
        // CloseBrace
        lexemes.push({ type: LexemeType.CloseBrace, text: null, line: curLine, column: curColumn });
      } else if (text[i] == ":") {
        lexemes.push({ type: LexemeType.Colon, text: null, line: curLine, column: curColumn });
      } else if (text[i] == "=") {
        // Gets or EqualTo or MapsTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.EqualTo, text: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.Assignment, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "!") {
        // Not or NotEqualTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.NotEqualTo, text: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.LogicalNot, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == ">") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.GreaterThanOrEqualTo, text: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.GreaterThan, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "<") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.LessThanOrEqualTo, text: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.LessThan, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "+") {
        // Plus or PlusGets
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.PlusGets, text: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.Plus, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "-") {
        // Minus or MinusGets
        if (i + 1 < text.length && !isWhitespace(text[i + 1])) {
          if (text[i + 1] == "=") {
            lexemes.push({ type: LexemeType.MinusGets, text: null, line: curLine, column: curColumn });
            i++;
          } else if (isNumber(text[i + 1])) {
            type = LexemeType.Numeric;
            value += "-";
            value += text[i + 1];
            i++;
          } else {
            lexemes.push({ type: LexemeType.Minus, text: null, line: curLine, column: curColumn });
          }
        } else {
          lexemes.push({ type: LexemeType.Minus, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "*") {
        // Multiply or MultiplyGets
        if (i + 1 < text.length && text[i + 1] != "=") {
          lexemes.push({ type: LexemeType.Multiply, text: null, line: curLine, column: curColumn });
        } else {
          lexemes.push({ type: LexemeType.MultiplyGets, text: null, line: curLine, column: curColumn });
          i++;
        }
      } else if (text[i] == "/") {
        // Divide or DivideGets or Comments
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.DivideGets, text: null, line: curLine, column: curColumn });
          i++;
        } else if (i + 1 < text.length && text[i + 1] == "/") {
          // Single line comment
          i += 2;
          while (i < text.length && text[i] != "\n") i++;
        } else if (i + 1 < text.length && text[i + 1] == "*") {
          // Multi line comment
          i += 2;
          while (i < text.length) {
            if (text[i] == "*" && i + 1 < text.length && text[i + 1] == "/") {
              i++;
              break;
            }

            i++;
          }
        } else {
          lexemes.push({ type: LexemeType.Divide, text: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "&" && i + 1 < text.length && text[i + 1] == "&") {
        // And
        lexemes.push({ type: LexemeType.LogicalAnd, text: null, line: curLine, column: curColumn });
        i++;
      } else if (text[i] == "|") {
        // ConditionalOr or ClosePipeBracket
        if (i + 1 < text.length) {
          if (text[i + 1] == "|") {
            lexemes.push({ type: LexemeType.LogicalOr, text: null, line: curLine, column: curColumn });
            i++;
          }
        }
      } else if (isLetter(text[i]) || text[i] == "_") {
        // Identifier
        type = LexemeType.Identifier;
        value += text[i];
      } else if (isNumber(text[i])) {
        // Numeric
        type = LexemeType.Numeric;
        value += text[i];
      }
    } else if (type == LexemeType.Char) {
      // We're inside a char

      if (text[i] != "'") {
        value += text[i];
      } else if (text[i - 1] == "\\") {
        value += text[i];
      } else {
        output = true;
      }
    } else if (type == LexemeType.String) {
      // We're inside a string

      if (text[i] != '"') {
        value += text[i];
      } else if (text[i - 1] == "\\") {
        value += text[i];
      } else {
        output = true;
      }
    } else if (type == LexemeType.Identifier) {
      // We're inside an identifier

      if (isLetter(text[i]) || isNumber(text[i]) || text[i] == "_") {
        value += text[i];
      } else {
        output = true;
        i--;
      }
    } else if (type == LexemeType.Numeric) {
      // We're inside a numeric

      if (isNumber(text[i])) {
        value += text[i];
      } else if (text[i] == ".") {
        isFloatingPoint = true;
        value += text[i];
      } else {
        output = true;
        i--;
      }
    }

    if (output) {
      // We've reached the end of a long lexeme
      if (type == LexemeType.Identifier) {
        switch (value) {
          case "import":
            lexemes.push({ type: LexemeType.Import, text: null, line: line, column: column });
            break;

          case "const":
            lexemes.push({ type: LexemeType.Const, text: null, line: line, column: column });
            break;

          case "let":
            lexemes.push({ type: LexemeType.Let, text: null, line: line, column: column });
            break;

          case "func":
          case "function":
            lexemes.push({ type: LexemeType.Func, text: null, line: line, column: column });
            break;

          case "return":
            lexemes.push({ type: LexemeType.Return, text: null, line: line, column: column });
            break;

          case "if":
            lexemes.push({ type: LexemeType.If, text: null, line: line, column: column });
            break;

          case "else":
            lexemes.push({ type: LexemeType.Else, text: null, line: line, column: column });
            break;

          case "while":
            lexemes.push({ type: LexemeType.While, text: null, line: line, column: column });
            break;

          case "for":
            lexemes.push({ type: LexemeType.For, text: null, line: line, column: column });
            break;

          case "of":
            lexemes.push({ type: LexemeType.Of, text: null, line: line, column: column });
            break;

          case "null":
            lexemes.push({ type: LexemeType.Null, text: null, line: line, column: column });
            break;

          case "true":
            lexemes.push({ type: LexemeType.True, text: null, line: line, column: column });
            break;

          case "false":
            lexemes.push({ type: LexemeType.False, text: null, line: line, column: column });
            break;

          default:
            lexemes.push({ type: type, text: value, line: line, column: column });
            break;
        }
      } else if (type == LexemeType.Numeric) {
        if (isFloatingPoint) {
          if (i + 1 < text.length && text[i + 1] == "f") {
            type = LexemeType.Float;
            i++;
          } else {
            type = LexemeType.Double;
          }
        } else {
          type = LexemeType.Integer;
        }

        lexemes.push({ type: type, text: value, line: line, column: column });
      } else if (type == LexemeType.Char) {
        lexemes.push({ type: type, text: value, line: line, column: column });
      } else if (type == LexemeType.String) {
        lexemes.push({ type: type, text: value, line: line, column: column });
      }

      output = false;
      type = LexemeType.Unknown;
      isFloatingPoint = false;
      value = "";
    }
  }

  if (type == LexemeType.Unknown) {
    // Add an EOF to mark the end of the script.
    lexemes.push({ type: LexemeType.EOF, text: null, line: line, column: column });
  }

  return lexemes;
}
