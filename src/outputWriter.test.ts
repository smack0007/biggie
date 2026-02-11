import assert from "node:assert";
import { EOL } from "node:os";
import { describe, it } from "node:test";
import { OutputWriter } from "./outputWriter.ts";

describe("OutputWriter", () => {
  it("hasContents returns false when append has never been called", () => {
    const stringBuilder = new OutputWriter();
    assert.strictEqual(stringBuilder.hasContents, false);
  });

  it("hasContents returns true when append has been called", () => {
    const stringBuilder = new OutputWriter();
    stringBuilder.append("foo");
    assert.strictEqual(stringBuilder.hasContents, true);
  });

  it("hasContents returns true when appendLine has been called with no parameters", () => {
    const stringBuilder = new OutputWriter();
    stringBuilder.appendLine();
    assert.strictEqual(stringBuilder.hasContents, true);
  });

  it("toString() returns empty string when no append(s) called", () => {
    const stringBuilder = new OutputWriter();
    assert.strictEqual(stringBuilder.toString(), "");
  });

  it("does not append extra new line", () => {
    const stringBuilder = new OutputWriter();
    stringBuilder.appendLine("One");
    stringBuilder.appendLine("Two");
    stringBuilder.append("Three");

    assert.strictEqual(stringBuilder.toString(), ["One", "Two", "Three"].join(EOL));
  });
});
