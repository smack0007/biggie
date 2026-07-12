import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bool, hasFlag } from "../shims.ts";

export function isConvertible(from: ast.Symbol | null, to: ast.Symbol | null): bool {
  if (from == null && to == null) {
    return true;
  }

  if (from == null || to == null) {
    return false;
  }

  if (from.flags != to.flags) {
    return false;
  }

  if (
    hasFlag(from.flags, ast.SymbolFlags.Builtin) && from.name == builtins.GlobalName.int &&
    hasFlag(to.flags, ast.SymbolFlags.Builtin) && to.name == builtins.GlobalName.int32
  ) {
    return true;
  }

  return false;
}
