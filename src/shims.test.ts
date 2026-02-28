import * as assert from "node:assert";
import { describe, it } from "node:test";
import { error, hasFlag, isError, isSuccess, nameof, success } from "./shims.ts";

describe("hasFlag", () => {
  it("returns false when both flags are zero", () => {
    const flags = 0;
    const flag = 0;

    assert.strictEqual(hasFlag(flags, flag), false);
  });

  it("returns true when flag is present", () => {
    const flags = 0b101;
    const flag = 0b001;

    assert.strictEqual(hasFlag(flags, flag), true);
  });

  it("returns false when flag is not present", () => {
    const flags = 0b100;
    const flag = 0b001;

    assert.strictEqual(hasFlag(flags, flag), false);
  });

  it("returns true when flags match exactly", () => {
    const flags = 0b1010;
    const flag = 0b1010;

    assert.strictEqual(hasFlag(flags, flag), true);
  });

  it("works with large numbers", () => {
    const flags = 0b11111111111111111111111111111111;
    const flag = 0b10000000000000000000000000000000;

    assert.strictEqual(hasFlag(flags, flag), true);
  });
});

describe("nameof", () => {
  it("returns the name of a function", () => {
    assert.equal(nameof(describe), "describe");
  });
});

describe("Result (success/error)", () => {
  it("success returns success=true and the value", () => {
    const result = success(42);
    assert.equal(isSuccess(result), true);
    assert.equal(isError(result), false);
    assert.equal(result.success, true);
    assert.equal(result.value, 42);
  });

  it("success can be called with no value", () => {
    const result = success();
    assert.equal(isSuccess(result), true);
    assert.equal(isError(result), false);
    assert.equal(result.success, true);
    assert.equal(result.value, undefined);
  });

  it("error returns success=false and the error", () => {
    const result = error("Something bad");
    assert.equal(isSuccess(result), false);
    assert.equal(isError(result), true);
    assert.equal(result.success, false);
    assert.equal(result.error, "Something bad");
  });
});
