import * as assert from "node:assert";
import { describe, it } from "node:test";
import { toString } from "./toString.ts";
import {
  makeArrayLiteral,
  makeAssignmentExpression,
  makeBoolLiteral,
  makeCallExpression,
  makeComparisonExpression,
  makeElementAccessExpression,
  makeEnumDeclaration,
  makeEnumMember,
  makeEqualityExpression,
  makeExpressionStatement,
  makeFuncDeclaration,
  makeIdentifier,
  makeImportDeclaration,
  makeIntLiteral,
  makeLogicalExpression,
  makeMethodDeclaration,
  makeMethodReceiver,
  makeMultiplicativeExpression,
  makeParenthesizedExpression,
  makePropertyAccessExpression,
  makeStatementBlock,
  makeStringLiteral,
  makeStructDeclaration,
  makeStructLiteral,
  makeStructLiteralElement,
  makeStructMember,
  makeTypeReference,
  makeUnaryExpression,
  makeVarDeclaration,
} from "./factories.ts";
import { Operator } from "./syntaxTree.ts";
import { EOL } from "../shims.ts";

describe("toString", () => {
  it("ArrayLiteral", () => {
    const arrayLiteral = makeArrayLiteral([
      makeIntLiteral("1"),
      makeIntLiteral("2"),
      makeIntLiteral("3"),
    ]);
    assert.strictEqual(toString(arrayLiteral), "[ 1, 2, 3 ]");
  });

  it("AssignmentExpression", () => {
    const expr = makeAssignmentExpression(makeIdentifier("x"), Operator.Equals, makeIntLiteral("10"));
    assert.strictEqual(toString(expr), "x = 10");

    expr.operator = Operator.PlusEquals;
    assert.strictEqual(toString(expr), "x += 10");
  });

  it("BoolLiteral", () => {
    const boolLiteral = makeBoolLiteral(true);
    assert.strictEqual(toString(boolLiteral), "true");
  });

  it("CallExpression", () => {
    const expr = makeCallExpression(makeIdentifier("println"), [makeStringLiteral("hello")]);
    assert.strictEqual(toString(expr), 'println("hello")');
  });

  it("ComparisonExpression", () => {
    const expr = makeComparisonExpression(makeIdentifier("a"), Operator.GreaterThan, makeIdentifier("b"));
    assert.strictEqual(toString(expr), "a > b");

    expr.operator = Operator.LessThanEquals;
    assert.strictEqual(toString(expr), "a <= b");
  });

  it("ElementAccessExpression", () => {
    const expr = makeElementAccessExpression(makeIdentifier("arr"), makeIntLiteral("0"));
    assert.strictEqual(toString(expr), "arr[0]");

    expr.argumentExpression = makeStringLiteral("foo");
    assert.strictEqual(toString(expr), `arr["foo"]`);
  });

  it("EnumDeclaration", () => {
    const enumDecl = makeEnumDeclaration(makeIdentifier("Color"), [
      makeEnumMember(makeIdentifier("red"), { initializer: makeIntLiteral("0") }),
      makeEnumMember(makeIdentifier("blue")),
      makeEnumMember(makeIdentifier("green")),
    ]);
    assert.strictEqual(toString(enumDecl), `enum Color {${EOL}red = 0,${EOL}blue,${EOL}green,${EOL}}${EOL}`);
  });

  it("ExpressionStatement", () => {
    const exprStmt = makeExpressionStatement(makeIntLiteral("42"));
    assert.strictEqual(toString(exprStmt), `42${EOL}`);
  });

  it("EqualityExpression", () => {
    const lhs = makeIdentifier("a");
    const rhs = makeIdentifier("b");
    const expr = makeEqualityExpression(lhs, Operator.EqualsEquals, rhs);
    assert.strictEqual(toString(expr), "a == b");
  });

  it("FuncDeclaration", () => {
    const funcDecl = makeFuncDeclaration(
      makeIdentifier("main"),
      [
        makeVarDeclaration(makeIdentifier("a"), makeIdentifier("int")),
      ],
      makeIdentifier("void"),
      makeStatementBlock([]),
    );
    assert.strictEqual(toString(funcDecl), `func main(a: int): void {}${EOL}`);
  });

  it("ImportDeclaration", () => {
    const importDecl = makeImportDeclaration(makeStringLiteral("./foo.big"), "/app/src/foo.big");
    assert.strictEqual(toString(importDecl), `import "./foo.big";${EOL}`);

    importDecl.alias = makeIdentifier("bar");
    assert.strictEqual(toString(importDecl), `import bar "./foo.big";${EOL}`);
  });

  it("Identifier", () => {
    const identifier = makeIdentifier("test");
    assert.strictEqual(toString(identifier), "test");
  });

  it("IntLiteral", () => {
    const intLiteral = makeIntLiteral("42");
    assert.strictEqual(toString(intLiteral), "42");
  });

  it("LogicalExpression", () => {
    const lhs = makeIdentifier("a");
    const rhs = makeIdentifier("b");
    const expr = makeLogicalExpression(lhs, Operator.AmpersandAmpersand, rhs);
    assert.strictEqual(toString(expr), "a && b");
  });

  it("MethodDeclaration", () => {
    const methodDecl = makeMethodDeclaration(
      makeMethodReceiver(makeIdentifier("self"), makeTypeReference(makeIdentifier("MyStruct"))),
      makeIdentifier("doSomething"),
      [makeVarDeclaration(makeIdentifier("x"), makeIdentifier("int"))],
      makeIdentifier("void"),
      makeStatementBlock([]),
    );
    assert.strictEqual(toString(methodDecl), `func (self: MyStruct) doSomething(x: int): void {}${EOL}`);
  });

  it("MethodReceiver", () => {
    const receiver = makeMethodReceiver(
      makeIdentifier("self"),
      makeTypeReference(makeIdentifier("MyStruct")),
    );
    assert.strictEqual(toString(receiver), "(self: MyStruct)");
  });

  it("MultiplicativeExpression", () => {
    const lhs = makeIdentifier("a");
    const rhs = makeIdentifier("b");
    const expr = makeMultiplicativeExpression(lhs, Operator.Asterisk, rhs);
    assert.strictEqual(toString(expr), "a * b");
  });

  it("ParenthesizedExpression", () => {
    const innerExpr = makeAssignmentExpression(makeIdentifier("a"), Operator.Equals, makeIntLiteral("1"));
    const parenExpr = makeParenthesizedExpression(innerExpr);
    assert.strictEqual(toString(parenExpr), "(a = 1)");
  });

  it("PropertyAccessExpression", () => {
    const obj = makeIdentifier("obj");
    const prop = makeIdentifier("prop");
    const expr = makePropertyAccessExpression(obj, prop);
    assert.strictEqual(toString(expr), "obj.prop");
  });

  it("StatementBlock", () => {
    const block = makeStatementBlock([]);
    assert.strictEqual(toString(block), `{}${EOL}`);
  });

  it("StringLiteral", () => {
    const stringLiteral = makeStringLiteral("hello");
    assert.strictEqual(toString(stringLiteral), '"hello"');
  });

  it("StructDeclaration", () => {
    const structDecl = makeStructDeclaration(makeIdentifier("Point"), [
      makeStructMember(makeIdentifier("x"), makeIdentifier("int")),
      makeStructMember(makeIdentifier("y"), makeIdentifier("int")),
    ]);

    assert.strictEqual(toString(structDecl), `struct Point {${EOL}x: int,${EOL}y: int,${EOL}}${EOL}`);
  });

  it("StructLiteral", () => {
    const node = makeStructLiteral([
      makeStructLiteralElement(makeIntLiteral("1"), { name: makeIdentifier("foo") }),
    ]);
    assert.strictEqual(toString(node), "{foo: 1}");

    node.elements.push(makeStructLiteralElement(makeIntLiteral("2"), { name: makeIdentifier("bar") }));
    assert.strictEqual(toString(node), "{foo: 1, bar: 2}");
  });

  it("StructLiteralElement", () => {
    const node = makeStructLiteralElement(makeIntLiteral("1"));
    assert.strictEqual(toString(node), "1");
  });

  it("TypeReference", () => {
    const typeRef = makeTypeReference(makeIdentifier("int"));
    assert.strictEqual(toString(typeRef), "int");
  });

  it("UnaryExpression", () => {
    let expr = makeUnaryExpression(Operator.Exclamation, makeBoolLiteral(true));
    assert.strictEqual(toString(expr), "!true");

    expr = makeUnaryExpression(Operator.Minus, makeIntLiteral("42"));
    assert.strictEqual(toString(expr), "-42");
  });

  it("VarDeclaration", () => {
    const varDecl = makeVarDeclaration(makeIdentifier("x"), makeIdentifier("int"));
    assert.strictEqual(toString(varDecl), `var x: int;${EOL}`);

    varDecl.initializer = makeIntLiteral("42");
    assert.strictEqual(toString(varDecl), `var x: int = 42;${EOL}`);
  });
});
