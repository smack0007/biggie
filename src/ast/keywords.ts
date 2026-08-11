import { TokenType } from "./tokens.ts";

export const KeywordMap: Readonly<Record<string, TokenType>> = {
  "defer": TokenType.Defer,
  "else": TokenType.Else,
  "enum": TokenType.Enum,
  "export": TokenType.Export,
  "false": TokenType.False,
  "for": TokenType.For,
  "func": TokenType.Func,
  "if": TokenType.If,
  "import": TokenType.Import,
  "null": TokenType.Null,
  "return": TokenType.Return,
  "struct": TokenType.Struct,
  "true": TokenType.True,
  "var": TokenType.Var,
  "while": TokenType.While,
};
