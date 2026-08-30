import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bind } from "./binder.ts";

describe("binder", () => {
  describe("bindCallExpression", () => {
    it("diagnostic error when func does not exist", () => {
      const callExpression = ast.makeCallExpression(ast.makeIdentifier("foo"), []);

      const program = ast.makeProgramFromExpression(callExpression);
      bind(program);

      assert.equal(program.diagnostics.length, 1);
      assert.equal(program.diagnostics[0].category, ast.DiagnosticCategory.Error);
    });

    it("diagnostic error when symbol is not a func", () => {
      const fooStruct = ast.makeStructDeclaration(
        ast.makeIdentifier("foo"),
        [],
      );

      const callExpression = ast.makeCallExpression(ast.makeIdentifier("foo"), [ast.makeStringLiteral("42")]);

      const program = ast.makeProgramFromExpression(callExpression, {
        topLevelStatements: [
          fooStruct,
        ],
      });
      bind(program);

      assert.equal(program.diagnostics.length, 1);
      assert.equal(program.diagnostics[0].category, ast.DiagnosticCategory.Error);
    });

    // TODO: Can be implemented once Symbols are refactored.
    // it("diagnostic error when arg type does not match", () => {
    //   const fooFunc = ast.makeFuncDeclaration(
    //     ast.makeIdentifier("foo"),
    //     [
    //       ast.makeVarDeclaration(ast.makeIdentifier("arg1"), ast.makeTypeReference(ast.makeIdentifier("int"))),
    //     ],
    //     ast.makeTypeReference(ast.makeIdentifier("void")),
    //     ast.makeStatementBlock([]),
    //   );

    //   const callExpression = ast.makeCallExpression(ast.makeIdentifier("foo"), [ast.makeStringLiteral("42")]);

    //   const program = ast.makeProgramFromExpression(callExpression, {
    //     topLevelStatements: [
    //       fooFunc,
    //     ],
    //   });
    //   bind(program);

    //   console.info(program.diagnostics);
    //   assert.equal(program.diagnostics.length, 1);
    //   assert.equal(program.diagnostics[0].category, ast.DiagnosticCategory.Error);
    // });
  });

  describe("bindStringLiteral", () => {
    it("binds StringLiteral", () => {
      const stringLiteral = ast.makeStringLiteral("Hello World!");
      const program = ast.makeProgramFromExpression(stringLiteral);
      bind(program);
      assert.strictEqual(stringLiteral.type, program.locals[builtins.GlobalName.string]);
    });
  });

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
      assert.strictEqual(varDeclaration.type, varDeclaration.declaredType.type);
    });

    it("diagnostic error when initializer does not match declearedType", () => {
      const typeReference = ast.makeTypeReference(ast.makeIdentifier(builtins.GlobalName.string));
      const varDeclaration = ast.makeVarDeclaration(
        ast.makeIdentifier("foo"),
        typeReference,
        {
          initializer: ast.makeIntLiteral("42"),
        },
      );

      const program = ast.makeProgramFromStatement(varDeclaration);
      bind(program);

      assert.equal(program.diagnostics.length, 1);
      assert.equal(program.diagnostics[0].category, ast.DiagnosticCategory.Error);
    });
  });
});
