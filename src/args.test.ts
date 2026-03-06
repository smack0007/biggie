import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as args from "./args.ts";
import { isError, isSuccess } from "./shims.ts";
import { ParserError } from "./frontend/parser.ts";

describe("args", () => {
  describe("parse", () => {
    const testData: [string[], args.ParseResult][] = [
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
        assert.deepStrictEqual(args.parse(input), output);
      });
    }

    it("fails with no args", () => {
      assert.throws(() => args.parse([]), (error) => {
        assert.equal((error as ParserError).kind, args.ParseErrorKind.NoInputFiles);
        return true;
      });
    });

    it("fails with unknown option", () => {
      assert.throws(() => args.parse(["--foo", "bar", "input.big"]), (error) => {
        assert.equal((error as ParserError).kind, args.ParseErrorKind.UnkownOption);
        return true;
      });
    });

    it("fails when no input files are provided", () => {
      assert.throws(() => args.parse(["-o", "output.c"]), (error) => {
        assert.equal((error as ParserError).kind, args.ParseErrorKind.NoInputFiles);
        return true;
      });
    });
  });
});
