import * as ast from "../ast/mod.ts";
import * as builtins from "./builtins.ts";
import { bool, hasFlag } from "../shims.ts";

const int = builtins.globals[builtins.GlobalName.int];
const int32 = builtins.globals[builtins.GlobalName.int32];

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
  lhs: ast.Symbol | null,
  rhs: ast.Symbol | null,
): ast.Symbol | null {
  if (lhs == rhs) {
    return lhs;
  }

  return null;
}
