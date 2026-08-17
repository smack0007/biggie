import * as assert from "../assert.ts";
import { hasFlag, uint, uint32 } from "../shims.ts";
import { SyntaxNode } from "./syntaxTree.ts";

export enum BindState {
  Uninitialized = 0,

  Initialized = 1,

  Finished = 2,
}

export enum SymbolFlags {
  None = 0,

  Builtin = 1 << 0,

  Extern = 1 << 1,

  Module = 1 << 2,

  Type = 1 << 3,

  Var = 1 << 4,

  Enum = 1 << 5,

  EnumMember = 1 << 6,

  Func = 1 << 7,

  Varadic = 1 << 8,

  Struct = 1 << 9,

  StructMember = 1 << 10,

  Method = 1 << 11,
}

export type SymbolTable = Record<string, Symbol>;

export interface Symbol {
  id: uint32;

  flags: SymbolFlags;

  declaration?: SyntaxNode;

  parent?: Symbol;

  name: string;
}

export interface SymbolWithMembers extends Symbol {
  members: SymbolTable;
}

export interface EnumSymbol extends SymbolWithMembers {
}

export interface FuncSymbol extends Symbol {
  beginVaradicArgsIndex: uint;
}

export interface ImportSymbol extends SymbolWithMembers {
}

export interface MethodSymbol extends Symbol {
  beginVaradicArgsIndex: uint;
}

export interface StructSymbol extends SymbolWithMembers {
}

export function getQualifiedNameForSymbol(symbol: Symbol): string {
  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
}

export function isSymbolWithMembers(symbol: Symbol): symbol is SymbolWithMembers {
  return hasFlag(symbol.flags, SymbolFlags.Enum | SymbolFlags.Module | SymbolFlags.Struct | SymbolFlags.Type);
}

export function isEnumSymbol(symbol: Symbol): symbol is EnumSymbol {
  return hasFlag(symbol.flags, SymbolFlags.Enum);
}

export function isFuncSymbol(symbol: Symbol): symbol is FuncSymbol {
  return hasFlag(symbol.flags, SymbolFlags.Func);
}

export function isStructSymbol(symbol: Symbol): symbol is StructSymbol {
  return hasFlag(symbol.flags, SymbolFlags.Struct);
}
