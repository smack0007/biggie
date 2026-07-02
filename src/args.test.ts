import * as assert from "node:assert";
import { describe, it } from "node:test";
import { parse, ParseError, ParseErrorKind, ParseResult } from "./args.ts";

describe("args", () => {
  describe("parse", () => {
    const testData: [string[], ParseResult][] = [
      [["--output", "./output.c", "./input.big"], {
        debug: false,
        output: "./output.c",
        files: ["./input.big"],
      }],

      [["-o", "./out/output.c", "./src/input.big"], {
        debug: false,
        output: "./out/output.c",
        files: ["./src/input.big"],
      }],

      [["--debug", "-o", "./out/output.c", "./src/input.big"], {
        debug: true,
        output: "./out/output.c",
        files: ["./src/input.big"],
      }],
    ];

    for (const [input, output] of testData) {
      it(`parses "${input.join(" ")}" correctly`, () => {
        assert.deepStrictEqual(parse(input), output);
      });
    }

    it("fails with no args", () => {
      assert.throws(() => parse([]), (error) => {
        assert.equal((error as ParseError).kind, ParseErrorKind.NoInputFiles);
        return true;
      });
    });

    it("fails with unknown option", () => {
      assert.throws(() => parse(["--foo", "bar", "input.big"]), (error) => {
        assert.equal((error as ParseError).kind, ParseErrorKind.UnkownOption);
        return true;
      });
    });

    it("fails when no input files are provided", () => {
      assert.throws(() => parse(["-o", "output.c"]), (error) => {
        assert.equal((error as ParseError).kind, ParseErrorKind.NoInputFiles);
        return true;
      });
    });
  });
});
