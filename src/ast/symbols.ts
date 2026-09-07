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

  args: Symbol[];
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

export function getQualifiedNameForSymbol(symbol: Symbol | null): string {
  if (symbol == null) {
    return "";
  }

  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
}

export function isSymbolCallable(symbol: Symbol | null): symbol is CallableSymbol {
  return symbol != null && (symbol.kind == SymbolKind.Func || symbol.kind == SymbolKind.Method);
}

export function isSymbolWithMembers(symbol: Symbol | null): symbol is SymbolWithMembers {
  return symbol != null && (
    symbol.kind == SymbolKind.Enum ||
    symbol.kind == SymbolKind.Import ||
    symbol.kind == SymbolKind.Struct ||
    symbol.kind == SymbolKind.Type
  );
}

export function isEnumSymbol(symbol: Symbol | null): symbol is EnumSymbol {
  return symbol != null && symbol.kind == SymbolKind.Enum;
}

export function isFuncSymbol(symbol: Symbol | null): symbol is FuncSymbol {
  return symbol != null && symbol.kind == SymbolKind.Func;
}

export function isStructSymbol(symbol: Symbol | null): symbol is StructSymbol {
  return symbol != null && symbol.kind == SymbolKind.Struct;
}
