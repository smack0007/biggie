import * as assert from "node:assert";
import { describe, it } from "node:test";
import { scan, TokenType } from "./scanner.ts";

describe("scanner", () => {
  describe("scan", () => {
    it("should handle empty input", () => {
      const tokens = scan("");
      assert.equal(tokens.length, 1);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.EOF });
    });

    it("should handle whitespace", () => {
      const tokens = scan("   \t\n  ");
      assert.equal(tokens.length, 1);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.EOF });
    });

    it("should handle single character tokens", () => {
      const tokens = scan("(){}[],.;");
      assert.equal(tokens.length, 10);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.OpenParen });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.CloseParen });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.OpenBrace });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.CloseBrace });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.OpenBracket });
      assert.partialDeepStrictEqual(tokens[5], { type: TokenType.CloseBracket });
      assert.partialDeepStrictEqual(tokens[6], { type: TokenType.Comma });
      assert.partialDeepStrictEqual(tokens[7], { type: TokenType.Dot });
      assert.partialDeepStrictEqual(tokens[8], { type: TokenType.Semicolon });
      assert.partialDeepStrictEqual(tokens[9], { type: TokenType.EOF });
    });

    it("should handle operators", () => {
      const tokens = scan("== != <= >= && ||");
      assert.equal(tokens.length, 7);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.EqualsEquals });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.ExclamationEquals });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.LessThanEqual });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.GreaterThanEqual });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.AmpersandAmpersand });
      assert.partialDeepStrictEqual(tokens[5], { type: TokenType.BarBar });
      assert.partialDeepStrictEqual(tokens[6], { type: TokenType.EOF });
    });

    it("should handle assignment operators", () => {
      const tokens = scan("= += -= *= /=");
      assert.equal(tokens.length, 6);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Equals });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.PlusEquals });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.MinusEquals });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.AsteriskEquals });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.SlashEquals });
      assert.partialDeepStrictEqual(tokens[5], { type: TokenType.EOF });
    });

    it("should handle identifiers", () => {
      const tokens = scan("hello world _test test123");
      assert.equal(tokens.length, 5);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Identifier, text: "hello" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.Identifier, text: "world" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.Identifier, text: "_test" });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.Identifier, text: "test123" });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.EOF });
    });

    it("should handle keywords", () => {
      const tokens = scan("func if else for while return var struct enum import export defer true false null");
      assert.equal(tokens.length, 16);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Func });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.If });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.Else });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.For });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.While });
      assert.partialDeepStrictEqual(tokens[5], { type: TokenType.Return });
      assert.partialDeepStrictEqual(tokens[6], { type: TokenType.Var });
      assert.partialDeepStrictEqual(tokens[7], { type: TokenType.Struct });
      assert.partialDeepStrictEqual(tokens[8], { type: TokenType.Enum });
      assert.partialDeepStrictEqual(tokens[9], { type: TokenType.Import });
      assert.partialDeepStrictEqual(tokens[10], { type: TokenType.Export });
      assert.partialDeepStrictEqual(tokens[11], { type: TokenType.Defer });
      assert.partialDeepStrictEqual(tokens[12], { type: TokenType.True });
      assert.partialDeepStrictEqual(tokens[13], { type: TokenType.False });
      assert.partialDeepStrictEqual(tokens[14], { type: TokenType.Null });
      assert.partialDeepStrictEqual(tokens[15], { type: TokenType.EOF });
    });

    it("should handle integers and floats", () => {
      const tokens = scan("42 3.14 0 -5");
      assert.equal(tokens.length, 5);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Integer, text: "42" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.Float, text: "3.14" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.Integer, text: "0" });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.Integer, text: "-5" });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.EOF });
    });

    it("should handle strings", () => {
      const tokens = scan('"hello" "world"');
      assert.equal(tokens.length, 3);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.String, text: "hello" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.String, text: "world" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.EOF });
    });

    it("should handle characters", () => {
      const tokens = scan("'a' 'b'");
      assert.equal(tokens.length, 3);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Char, text: "a" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.Char, text: "b" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.EOF });
    });

    it("should handle comments", () => {
      const tokens = scan("// This is a comment\nhello // Another comment\nworld");
      assert.equal(tokens.length, 3);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Identifier, text: "hello" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.Identifier, text: "world" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.EOF });
    });

    it("should handle multi-line comments", () => {
      const tokens = scan("/* This is a\nmulti-line comment */ hello");
      assert.equal(tokens.length, 2);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Identifier, text: "hello" });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.EOF });
    });

    it("should handle mixed tokens", () => {
      const tokens = scan("func main() { return 42; }");
      assert.equal(tokens.length, 10);
      assert.partialDeepStrictEqual(tokens[0], { type: TokenType.Func });
      assert.partialDeepStrictEqual(tokens[1], { type: TokenType.Identifier, text: "main" });
      assert.partialDeepStrictEqual(tokens[2], { type: TokenType.OpenParen });
      assert.partialDeepStrictEqual(tokens[3], { type: TokenType.CloseParen });
      assert.partialDeepStrictEqual(tokens[4], { type: TokenType.OpenBrace });
      assert.partialDeepStrictEqual(tokens[5], { type: TokenType.Return });
      assert.partialDeepStrictEqual(tokens[6], { type: TokenType.Integer, text: "42" });
      assert.partialDeepStrictEqual(tokens[7], { type: TokenType.Semicolon });
      assert.partialDeepStrictEqual(tokens[8], { type: TokenType.CloseBrace });
      assert.partialDeepStrictEqual(tokens[9], { type: TokenType.EOF });
    });
  });
});
