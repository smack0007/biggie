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

export type Table = Record<string, Symbol>;

export interface Symbol {
  sourceFileName: string;

  name: string;

  flags: Flags;

  members?: Table;
}

export interface Declaration {
  symbol?: Symbol;
}

export type Reference = Declaration;

export interface Scope {
  locals?: Table;

  nextSymbolScope?: Scope;
}
