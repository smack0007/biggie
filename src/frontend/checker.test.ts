import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import * as checker from "./checker.ts";
import { bool } from "../shims.ts";

const int = builtins.globals[builtins.GlobalName.int];
const int32 = builtins.globals[builtins.GlobalName.int32];
const string = builtins.globals[builtins.GlobalName.string];

describe("checker", () => {
  describe("isConvertible", () => {
    const TESTS: [ast.Symbol | null, ast.Symbol | null, bool][] = [
      [null, null, true],
      [null, int, false],
      [int, null, false],
      [int, int32, true],
      [int, string, false],
      [string, string, true],
    ];

    for (const [from, to, result] of TESTS) {
      it(`(${from?.name ?? "null"}, ${to?.name ?? "null"}) => ${result}`, () => {
        assert.equal(checker.isConvertible(from, to), result);
      });
    }
  });

  describe("operationResult", () => {
    const TESTS: Record<number, [ast.Symbol | null, ast.Symbol | null, ast.Symbol | null][]> = {
      [ast.Operator.Plus]: [
        [null, null, null],
        [string, string, string],
      ],
    };

    for (const [key, operatorTests] of Object.entries(TESTS)) {
      const operator = <ast.Operator> parseInt(key);
      for (const [from, to, result] of operatorTests) {
        it(`(${ast.operatorToString(operator)}, ${from?.name ?? "null"}, ${to?.name ?? "null"}) => ${result?.name ?? "null"}`, () => {
          assert.equal(checker.operationResult(operator, from, to), result);
        });
      }
    }
  });
});
