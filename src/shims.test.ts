import * as assert from "node:assert";
import { describe, it } from "node:test";
import { error, isError, isSuccess, nameof, success } from "./shims.ts";

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
