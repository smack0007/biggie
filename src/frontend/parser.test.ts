import * as assert from "node:assert";
import { describe, it } from "node:test";
import { parse, ParseOptions } from "./parser.ts";
import { scan } from "./scanner.ts";
import { DiagnosticCategory } from "../ast/syntaxTree.ts";

const TEST_ENTRY_FILE_NAME = "<test>";

function makeParseTestOptions(source: string): ParseOptions {
  return {
    log: () => {},
    scan: (_fileName: string) => Promise.resolve(scan(source)),
  };
}

describe("parser", () => {
  describe("diagnostic error for invalid top level statements", () => {
    const INVALID_SOURCES: string[] = [
      "defer cleanup();",
      "if(true) {}",
      "while(false) {}",
    ];

    for (const source of INVALID_SOURCES) {
      it(source, async () => {
        const result = await parse(TEST_ENTRY_FILE_NAME, makeParseTestOptions(source));
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].category, DiagnosticCategory.Error);
      });
    }
  });

  describe("diagnostic error for invalid export declarations", () => {
    const INVALID_SOURCES: string[] = [
      "export extern func foo(): void;",
      //`export import foo "./foo.big";`,
    ];

    for (const source of INVALID_SOURCES) {
      it(source, async () => {
        const result = await parse(TEST_ENTRY_FILE_NAME, makeParseTestOptions(source));
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].category, DiagnosticCategory.Error);
      });
    }
  });

  describe("diagnostic error for invalid extern declarations", () => {
    const INVALID_SOURCES: string[] = [
      "extern enum Foo {}",
      "extern struct Foo {}",
    ];

    for (const source of INVALID_SOURCES) {
      it(source, async () => {
        const result = await parse(TEST_ENTRY_FILE_NAME, makeParseTestOptions(source));
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].category, DiagnosticCategory.Error);
      });
    }
  });
});
