import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bool, hasFlag } from "../shims.ts";

const int = <ast.TypeSymbol> builtins.globals[builtins.GlobalName.int];
const int32 = <ast.TypeSymbol> builtins.globals[builtins.GlobalName.int32];
const _null = <ast.TypeSymbol> builtins.globals[builtins.GlobalName.null];

export function isConvertible(from: ast.Symbol | null, to: ast.Symbol | null): bool {
  if (to == from) {
    return true;
  }

  if (from == null || to == null) {
    return false;
  }

  if (from.flags != to.flags) {
    return false;
  }

  if (hasFlag(from.flags, ast.SymbolFlags.Builtin) && hasFlag(to.flags, ast.SymbolFlags.Builtin)) {
    switch (from.id) {
      case int.id:
        switch (to.id) {
          case int32.id:
            return true;
        }
        break;
    }
  }

  return false;
}

export function operationResult(
  operator: ast.Operator,
  lhs: ast.TypeSymbol | null,
  rhs: ast.TypeSymbol | null,
): ast.TypeSymbol {
  if (lhs == rhs) {
    if (lhs == null) {
      return _null;
    } else {
      return lhs;
    }
  }

  return _null;
}
