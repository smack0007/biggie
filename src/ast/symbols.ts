import { uint, uint32 } from "../shims.ts";
import { SyntaxNode } from "./syntaxTree.ts";

export enum SymbolKind {
  Unknown = 0,

  Enum,

  EnumMember,

  Func,

  Import,

  Method,

  MethodReceiver,

  Struct,

  StructMember,

  Type,

  Var,
}

export enum SymbolFlags {
  None = 0,

  Builtin = 1 << 0,

  Extern = 1 << 1,

  Varadic = 1 << 2,
}

export type SymbolTable = Record<string, Symbol>;

export interface Symbol {
  kind: SymbolKind;

  id: uint32;

  flags: SymbolFlags;

  declaration?: SyntaxNode;

  parent?: Symbol;

  name: string;
}

export interface CallableSymbol extends Symbol {
  beginVaradicArgsIndex: uint;
}

export interface SymbolWithMembers extends Symbol {
  members: SymbolTable;
}

export interface UnknownSymbol extends Symbol {
  kind: SymbolKind.Unknown;
}

export interface EnumSymbol extends SymbolWithMembers {
  kind: SymbolKind.Enum;
}

export interface EnumMemberSymbol extends Symbol {
  kind: SymbolKind.EnumMember;
}

export interface FuncSymbol extends CallableSymbol {
  kind: SymbolKind.Func;
}

export interface ImportSymbol extends SymbolWithMembers {
  kind: SymbolKind.Import;
}

export interface MethodSymbol extends CallableSymbol {
  kind: SymbolKind.Method;
}

export interface MethodReceiverSymbol extends SymbolWithMembers {
  kind: SymbolKind.MethodReceiver;
}

export interface StructSymbol extends SymbolWithMembers {
  kind: SymbolKind.Struct;
}

export interface StructMemberSymbol extends SymbolWithMembers {
  kind: SymbolKind.StructMember;
}

export interface TypeSymbol extends SymbolWithMembers {
  kind: SymbolKind.Type;
}

export interface VarSymbol extends Symbol {
  kind: SymbolKind.Var;
}

export const UnknownSymbol: UnknownSymbol = {
  kind: SymbolKind.Unknown,
  name: "<unknown>",
  id: 0,
  flags: SymbolFlags.None,
} as const;

export const UnknownTypeSymbol: TypeSymbol = {
  kind: SymbolKind.Type,
  name: "<unknownType>",
  id: 0,
  flags: SymbolFlags.None,
  members: {},
} as const;

export function getQualifiedNameForSymbol(symbol: Symbol): string {
  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
}

export function isSymbolCallable(symbol: Symbol): symbol is CallableSymbol {
  return symbol.kind == SymbolKind.Func || symbol.kind == SymbolKind.Method;
}

export function isSymbolWithMembers(symbol: Symbol): symbol is SymbolWithMembers {
  return (
    symbol.kind == SymbolKind.Enum ||
    symbol.kind == SymbolKind.Import ||
    symbol.kind == SymbolKind.Struct ||
    symbol.kind == SymbolKind.Type
  );
}

export function isEnumSymbol(symbol: Symbol): symbol is EnumSymbol {
  return symbol.kind == SymbolKind.Enum;
}

export function isFuncSymbol(symbol: Symbol): symbol is FuncSymbol {
  return symbol.kind == SymbolKind.Func;
}

export function isStructSymbol(symbol: Symbol): symbol is StructSymbol {
  return symbol.kind == SymbolKind.Struct;
}
