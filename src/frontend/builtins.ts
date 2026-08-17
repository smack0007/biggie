import { FuncSymbol, Symbol, SymbolFlags, SymbolTable, SymbolWithMembers } from "../ast/symbols.ts";
import { generateId, IDType } from "./ids.ts";
import { uint } from "../shims.ts";

interface BuiltinSymbolOptionalArgs {
  beginVaradicArgsIndex?: uint;
}

function builtinSymbol(
  name: string,
  flags: SymbolFlags,
  members: SymbolTable | null = null,
  optional: BuiltinSymbolOptionalArgs = {},
): Symbol {
  const symbol: Symbol = {
    id: generateId(IDType.symbol),
    flags: SymbolFlags.Builtin | flags,
    name,
  };

  // TODO: Fix this hack
  if (members) {
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

  return symbol;
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
  println = "println",
  string = "string",
  void = "void",
}

export const globals = builtinSymbolTable(
  builtinSymbol(
    GlobalName.Array,
    SymbolFlags.Type,
    builtinSymbolTable(
      builtinSymbol("length", SymbolFlags.Method),
    ),
  ),
  builtinSymbol(
    GlobalName.bool,
    SymbolFlags.Type,
  ),
  builtinSymbol(
    GlobalName.int,
    SymbolFlags.Type,
  ),
  builtinSymbol(
    GlobalName.int32,
    SymbolFlags.Type,
  ),
  builtinSymbol(
    GlobalName.println,
    SymbolFlags.Func,
    null,
  ),
  builtinSymbol(
    GlobalName.string,
    SymbolFlags.Type,
    builtinSymbolTable(
      builtinSymbol("length", SymbolFlags.Method),
    ),
  ),
  builtinSymbol(
    GlobalName.void,
    SymbolFlags.Type,
  ),
);
