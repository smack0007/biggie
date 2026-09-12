import { uint, uint32 } from "../shims.ts";
import {
  Declaration,
  EnumDeclaration,
  EnumMember,
  ExternFuncDeclaration,
  FuncDeclaration,
  ImportDeclaration,
  MethodDeclaration,
  MethodReceiver,
  Program,
  StructDeclaration,
  StructMember,
  VarDeclaration,
} from "./syntaxTree.ts";

export enum SymbolKind {
  Enum,

  EnumMember,

  ExternFunc,

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

  parent?: Symbol;

  name: string;
}

export interface CallableSymbol extends Symbol {
  beginVaradicArgsIndex: uint;

  args: Symbol[];
}

export interface SymbolWithDeclaration<T extends Declaration<Symbol>> extends Symbol {
  declaration: T | Program;
}

export interface SymbolWithMembers extends Symbol {
  members: SymbolTable;
}

export interface EnumSymbol extends SymbolWithMembers, SymbolWithDeclaration<EnumDeclaration> {
  kind: SymbolKind.Enum;
}

export interface EnumMemberSymbol extends Symbol, SymbolWithDeclaration<EnumMember> {
  kind: SymbolKind.EnumMember;
}

export interface ExternFuncSymbol extends CallableSymbol, SymbolWithDeclaration<ExternFuncDeclaration> {
  kind: SymbolKind.ExternFunc;
}

export interface FuncSymbol extends CallableSymbol, SymbolWithDeclaration<FuncDeclaration> {
  kind: SymbolKind.Func;
}

export interface ImportSymbol extends SymbolWithMembers, SymbolWithDeclaration<ImportDeclaration> {
  kind: SymbolKind.Import;
}

export interface MethodSymbol extends CallableSymbol, SymbolWithDeclaration<MethodDeclaration> {
  kind: SymbolKind.Method;
}

export interface MethodReceiverSymbol extends SymbolWithMembers, SymbolWithDeclaration<MethodReceiver> {
  kind: SymbolKind.MethodReceiver;
}

export interface StructSymbol extends SymbolWithMembers, SymbolWithDeclaration<StructDeclaration> {
  kind: SymbolKind.Struct;
}

export interface StructMemberSymbol extends SymbolWithMembers, SymbolWithDeclaration<StructMember> {
  kind: SymbolKind.StructMember;
}

export interface TypeSymbol extends SymbolWithMembers, SymbolWithDeclaration<Declaration<Symbol>> {
  kind: SymbolKind.Type;
}

export interface VarSymbol extends Symbol, SymbolWithDeclaration<VarDeclaration> {
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
