import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bind } from "./binder.ts";

describe("binder", () => {
  describe("bindStingLiteral", () => {
    it("binds StringLiteral", () => {
      const stringLiteral = ast.makeStringLiteral("Hello World!");
      bind(ast.makeProgramFromExpression(stringLiteral));
      assert.strictEqual(stringLiteral.bindState, ast.BindState.Finished);
      assert.strictEqual(stringLiteral.type, builtins.globals["string"]);
    });
  });
});
