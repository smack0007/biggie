export enum BinderState {
  Uninitialized = 0,

  Initialized = 1,

  Finished = 2,
}

export enum Flags {
  None = 0,

  Module = 1 << 0,

  Enum = 1 << 1,

  EnumMember = 1 << 2,

  Func = 1 << 3,

  Struct = 1 << 4,

  StructMember = 1 << 5,

  Var = 1 << 6,
}

export interface BinderNode {
  binderState: BinderState;
}

export type SymbolTable = Record<string, Symbol>;

export interface Symbol {
  sourceFileName: string;

  name: string;

  flags: Flags;

  members?: SymbolTable;
}

export interface Declaration {
  symbol?: Symbol;
}

export type Reference = Declaration;

export interface Scope {
  locals?: SymbolTable;

  nextSymbolScope?: Scope;
}
