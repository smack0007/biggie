import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bind } from "./binder.ts";

describe("binder", () => {
  describe("bindVarDeclaration", () => {
    it("inherits type symbol from declaredType", () => {
      const typeReference = ast.makeTypeReference(ast.makeIdentifier(builtins.GlobalName.string));
      const varDeclaration = ast.makeVarDeclaration(
        ast.makeIdentifier("foo"),
        typeReference,
        {
          initializer: ast.makeStringLiteral("bar"),
        },
      );
      bind(ast.makeProgramFromStatement(varDeclaration));
      assert.strictEqual(varDeclaration.bindState, ast.BindState.Finished);
      assert.strictEqual(varDeclaration.type, varDeclaration.declaredType.type);
    });

    it("errors when initializer does not match declearedType", () => {
      const typeReference = ast.makeTypeReference(ast.makeIdentifier(builtins.GlobalName.string));
      const varDeclaration = ast.makeVarDeclaration(
        ast.makeIdentifier("foo"),
        typeReference,
        {
          initializer: ast.makeIntLiteral("42"),
        },
      );
      assert.throws(() => bind(ast.makeProgramFromStatement(varDeclaration)));
    });
  });

  describe("bindStingLiteral", () => {
    it("binds StringLiteral", () => {
      const stringLiteral = ast.makeStringLiteral("Hello World!");
      const program = ast.makeProgramFromExpression(stringLiteral);
      bind(program);
      assert.strictEqual(stringLiteral.bindState, ast.BindState.Finished);
      assert.strictEqual(stringLiteral.type, program.locals[builtins.GlobalName.string]);
    });
  });
});
