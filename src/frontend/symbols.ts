export enum SymbolFlags {
  None = 0,

  Module = 1 << 0,

  Enum = 1 << 1,

  EnumMember = 1 << 2,

  Function = 1 << 3,

  Struct = 1 << 4,

  StructMember = 1 << 5,

  Variable = 1 << 6,
}

export type SymbolTable = Record<string, Symbol>;

export interface Symbol {
  sourceFileName: string;

  name: string;

  flags: SymbolFlags;

  members?: SymbolTable;
}

export interface SymbolDeclaration {
  readonly symbol?: Symbol;
}

export type SymbolReference = SymbolDeclaration;

export interface SymbolScope {
  readonly locals?: SymbolTable;

  readonly nextSymbolScope?: SymbolScope;
}
