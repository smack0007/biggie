import { Symbol, SymbolFlags, SymbolTable } from "../ast/syntaxTree.ts";
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
    members: members ?? undefined,
    beginVaradicArgsIndex: optional.beginVaradicArgsIndex,
  };

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
    SymbolFlags.Func | SymbolFlags.Varadic,
    null,
    {
      beginVaradicArgsIndex: 1,
    },
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
