import { Symbol, SymbolFlags, SymbolTable } from "../ast/syntaxTree.ts";

const BUILTIN_SOURCE_FILE_NAME = "<builtin>";

type BuiltinSymbol = Symbol & {
  sourceFileName: typeof BUILTIN_SOURCE_FILE_NAME;
};

function builtinSymbol(name: string, flags: SymbolFlags, members?: SymbolTable): BuiltinSymbol {
  const symbol: BuiltinSymbol = {
    sourceFileName: BUILTIN_SOURCE_FILE_NAME,
    name,
    flags: SymbolFlags.Builtin | flags,
    members,
  };

  if (members) {
    for (const member of Object.values(members)) {
      member.parent = symbol;
    }
  }

  return symbol;
}

function builtinSymbolTable(...symbols: BuiltinSymbol[]): SymbolTable {
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
