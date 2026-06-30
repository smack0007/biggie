import { BindFlags, Symbol, SymbolTable } from "./ast/syntaxTree.ts";

const BUILTIN_SOURCE_FILE_NAME = "<builtin>";

type BuiltinSymbol = Symbol & {
  sourceFileName: typeof BUILTIN_SOURCE_FILE_NAME;
};

function builtinSymbol(name: string, flags: BindFlags, members?: SymbolTable): BuiltinSymbol {
  const symbol: BuiltinSymbol = {
    sourceFileName: BUILTIN_SOURCE_FILE_NAME,
    name,
    flags: BindFlags.Builtin | flags,
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

export const globals = builtinSymbolTable(
  builtinSymbol(
    "Array",
    BindFlags.Type,
    builtinSymbolTable(
      builtinSymbol("length", BindFlags.Method),
    ),
  ),
  builtinSymbol(
    "int",
    BindFlags.Type,
  ),
  builtinSymbol(
    "int32",
    BindFlags.Type,
  ),
  builtinSymbol(
    "println",
    BindFlags.Func,
  ),
  builtinSymbol(
    "string",
    BindFlags.Type,
    builtinSymbolTable(
      builtinSymbol("length", BindFlags.Method),
    ),
  ),
  builtinSymbol(
    "void",
    BindFlags.Type,
  ),
);
