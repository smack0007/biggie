import { TextPosition } from "./textPosition.ts";

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
