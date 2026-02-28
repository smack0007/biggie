import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as args from "./args.ts";
import { isError, isSuccess } from "./shims.ts";

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
        const result = args.parse(input);
        if (isSuccess(result)) {
          assert.deepStrictEqual(result.value, output);
        } else {
          assert.fail("args.parse failed.");
        }
      });
    }

    it("fails with no args", () => {
      const result = args.parse([]);
      if (isError(result)) {
        assert.equal(result.error.kind, args.ParseErrorKind.NoInputFiles);
      } else {
        assert.fail("args.parse succeeded.");
      }
    });

    it("fails with unknown option", () => {
      const result = args.parse(["--foo", "bar", "input.big"]);
      if (isError(result)) {
        assert.equal(result.error.kind, args.ParseErrorKind.UnkownOption);
      } else {
        assert.fail("args.parse succeeded.");
      }
    });

    it("fails when no input files are provided", () => {
      const result = args.parse(["-o", "output.c"]);
      if (isError(result)) {
        assert.equal(result.error.kind, args.ParseErrorKind.NoInputFiles);
      } else {
        assert.fail("args.parse succeeded.");
      }
    });
  });
});
