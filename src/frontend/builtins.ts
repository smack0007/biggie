import { BindFlags, SymbolTable } from "./ast/syntaxTree.ts";

export const ArraySymbolTable: SymbolTable = {
  "length": {
    sourceFileName: "builtin",
    name: "length",
    flags: BindFlags.Builtin | BindFlags.Method,
    // TODO: Don't like that this is defined here. Would be nice if C Backend could set this.
    builtinName: "array_length",
  },
};
