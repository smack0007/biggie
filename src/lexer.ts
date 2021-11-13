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
  Gets,

  // !
  Not,

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

  // ++
  Increment,

  // +=
  PlusGets,

  // -
  Minus,

  // --
  Decrement,

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
  ConditionalAnd,

  // ||
  ConditionalOr,

  // Used to indicate the end of a list of Lexemes.
  EOF,
}

export interface Lexeme {
  type: LexemeType;
  value: string | null;
  line: int;
  column: int;
}

function isNumber(ch: char) {
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

function isWhitespace(ch: char) {
  return ch == " " || ch == "\t" || ch == "\r" || ch == "\n";
}

function isLetter(ch: char) {
  return ch.toUpperCase() != ch.toLowerCase() || ch.codePointAt(0) > 127;
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

  for (let i = 0; i < text.length - 1; i++, curColumn++) {
    if (text[i] == "\n") {
      curLine++;
      curColumn = 1;
    }

    if (type == LexemeType.Unknown) {
      // We're looking for a lexeme
      if (isWhitespace(text[i])) {
        // Skip over white space
        continue;
      } else if (text[i] == "'") {
        // Start of a string
        line = curLine;
        column = curColumn;

        type = LexemeType.Char;
      } else if (text[i] == '"') {
        // Start of a magic string
        line = curLine;
        column = curColumn;

        type = LexemeType.String;
      } else if (text[i] == ";") {
        // End Statement
        lexemes.push({ type: LexemeType.EndStatement, value: null, line: curLine, column: curColumn });
      } else if (text[i] == ".") {
        // Period
        lexemes.push({ type: LexemeType.Dot, value: null, line: curLine, column: curColumn });
      } else if (text[i] == ",") {
        // Period
        lexemes.push({ type: LexemeType.Comma, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "(") {
        // OpenParen
        lexemes.push({ type: LexemeType.OpenParen, value: null, line: curLine, column: curColumn });
      } else if (text[i] == ")") {
        // CloseParen
        lexemes.push({ type: LexemeType.CloseParen, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "[") {
        // OpenBracket
        lexemes.push({ type: LexemeType.OpenBracket, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "]") {
        // CloseBracket
        lexemes.push({ type: LexemeType.CloseBracket, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "{") {
        // OpenBrace
        lexemes.push({ type: LexemeType.OpenBrace, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "}") {
        // CloseBrace
        lexemes.push({ type: LexemeType.CloseBrace, value: null, line: curLine, column: curColumn });
      } else if (text[i] == ":") {
        lexemes.push({ type: LexemeType.Colon, value: null, line: curLine, column: curColumn });
      } else if (text[i] == "=") {
        // Gets or EqualTo or MapsTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.EqualTo, value: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.Gets, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "!") {
        // Not or NotEqualTo
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.NotEqualTo, value: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.Not, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == ">") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.GreaterThanOrEqualTo, value: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.GreaterThan, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "<") {
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.LessThanOrEqualTo, value: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.LessThan, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "+") {
        // Plus or PlusGets
        if (text[i + 1] == "+") {
          lexemes.push({ type: LexemeType.Increment, value: null, line: curLine, column: curColumn });
          i++;
        } else if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.PlusGets, value: null, line: curLine, column: curColumn });
          i++;
        } else {
          lexemes.push({ type: LexemeType.Plus, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "-") {
        // Minus or MinusGets
        if (i + 1 < text.length && !isWhitespace(text[i + 1])) {
          if (text[i + 1] == "-") {
            lexemes.push({ type: LexemeType.Decrement, value: null, line: curLine, column: curColumn });
            i++;
          } else if (text[i + 1] == "=") {
            lexemes.push({ type: LexemeType.MinusGets, value: null, line: curLine, column: curColumn });
            i++;
          } else if (isNumber(text[i + 1])) {
            type = LexemeType.Numeric;
            value += "-";
            value += text[i + 1];
            i++;
          } else {
            lexemes.push({ type: LexemeType.Minus, value: null, line: curLine, column: curColumn });
          }
        } else {
          lexemes.push({ type: LexemeType.Minus, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "*") {
        // Multiply or MultiplyGets
        if (i + 1 < text.length && text[i + 1] != "=") {
          lexemes.push({ type: LexemeType.Multiply, value: null, line: curLine, column: curColumn });
        } else {
          lexemes.push({ type: LexemeType.MultiplyGets, value: null, line: curLine, column: curColumn });
          i++;
        }
      } else if (text[i] == "/") {
        // Divide or DivideGets or Comments
        if (i + 1 < text.length && text[i + 1] == "=") {
          lexemes.push({ type: LexemeType.DivideGets, value: null, line: curLine, column: curColumn });
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
          lexemes.push({ type: LexemeType.Divide, value: null, line: curLine, column: curColumn });
        }
      } else if (text[i] == "&" && i + 1 < text.length && text[i + 1] == "&") {
        // And
        lexemes.push({ type: LexemeType.ConditionalAnd, value: null, line: curLine, column: curColumn });
        i++;
      } else if (text[i] == "|") {
        // ConditionalOr or ClosePipeBracket
        if (i + 1 < text.length) {
          if (text[i + 1] == "|") {
            lexemes.push({ type: LexemeType.ConditionalOr, value: null, line: curLine, column: curColumn });
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
            lexemes.push({ type: LexemeType.Import, value: null, line: curLine, column: curColumn });
            break;

          case "const":
            lexemes.push({ type: LexemeType.Const, value: null, line: curLine, column: curColumn });
            break;

          case "let":
            lexemes.push({ type: LexemeType.Let, value: null, line: curLine, column: curColumn });
            break;

          case "func":
          case "function":
            lexemes.push({ type: LexemeType.Func, value: null, line: line, column: column });
            break;

          case "return":
            lexemes.push({ type: LexemeType.Return, value: null, line: line, column: column });
            break;

          case "if":
            lexemes.push({ type: LexemeType.If, value: null, line: line, column: column });
            break;

          case "else":
            lexemes.push({ type: LexemeType.Else, value: null, line: line, column: column });
            break;

          case "while":
            lexemes.push({ type: LexemeType.While, value: null, line: line, column: column });
            break;

          case "for":
            lexemes.push({ type: LexemeType.For, value: null, line: line, column: column });
            break;

          case "of":
            lexemes.push({ type: LexemeType.Of, value: null, line: line, column: column });
            break;

          case "null":
            lexemes.push({ type: LexemeType.Null, value: null, line: line, column: column });
            break;

          case "true":
            lexemes.push({ type: LexemeType.True, value: null, line: line, column: column });
            break;

          case "false":
            lexemes.push({ type: LexemeType.False, value: null, line: line, column: column });
            break;

          default:
            lexemes.push({ type: type, value: value, line: line, column: column });
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

        lexemes.push({ type: type, value: value, line: line, column: column });
      } else if (type == LexemeType.Char) {
        lexemes.push({ type: type, value: value, line: line, column: column });
      } else if (type == LexemeType.String) {
        lexemes.push({ type: type, value: value, line: line, column: column });
      }

      output = false;
      type = LexemeType.Unknown;
      isFloatingPoint = false;
      value = "";
    }
  }

  if (type == LexemeType.Unknown) {
    // Add an EOF to mark the end of the script.
    lexemes.push({ type: LexemeType.EOF, value: null, line: line, column: column });
  }

  return lexemes;
}
