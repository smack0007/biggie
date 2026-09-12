import { assert } from "node:console";
import { generateId, IDType } from "../ast/ids.ts";
import {
  FuncSymbol,
  Symbol,
  SymbolFlags,
  SymbolKind,
  SymbolTable,
  SymbolWithMembers,
  TypeSymbol,
} from "../ast/symbols.ts";
import { uint } from "../shims.ts";

interface BuiltinSymbolOptionalArgs {
  beginVaradicArgsIndex?: uint;
}

// TODO: Make different function for different symbol kinds.
function builtinSymbol<T extends Symbol>(
  kind: SymbolKind,
  name: string,
  members: SymbolTable = {},
  optional: BuiltinSymbolOptionalArgs = {},
): T {
  const symbol: Symbol = {
    id: generateId(IDType.Symbol),
    kind,
    flags: SymbolFlags.Builtin,
    name,
  };

  // TODO: Fix this hack
  if (kind == SymbolKind.Type) {
    (<SymbolWithMembers> symbol).members = members;
  }

  // TODO: Fix this hack
  if (optional.beginVaradicArgsIndex !== undefined) {
    (<FuncSymbol> symbol).beginVaradicArgsIndex = optional.beginVaradicArgsIndex;
  }

  if (members) {
    for (const member of Object.values(members)) {
      member.parent = symbol;
    }
  }

  return <T> symbol;
}

function builtinSymbolTable(...symbols: Symbol[]): SymbolTable {
  const symbolTable: SymbolTable = {};
  for (const symbol of symbols) {
    symbolTable[symbol.name] = symbol;
  }
  return symbolTable;
}

export enum GlobalName {
  Array = "Array",
  bool = "bool",
  int = "int",
  int32 = "int32",
  null = "null",
  println = "println",
  string = "string",
  void = "void",
}

export const globals = builtinSymbolTable(
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.Array,
    builtinSymbolTable(
      builtinSymbol(SymbolKind.Method, "length"),
    ),
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.bool,
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.int,
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.int32,
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.null,
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Func,
    GlobalName.println,
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.string,
    builtinSymbolTable(
      builtinSymbol(SymbolKind.Method, "length"),
    ),
  ),
  builtinSymbol<TypeSymbol>(
    SymbolKind.Type,
    GlobalName.void,
  ),
);
