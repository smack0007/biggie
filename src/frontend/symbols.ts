export enum SymbolFlags {
  None = 0,

  Module,

  Enum,

  EnumMember,

  Function,

  Struct,

  StructMember,

  Variable,
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
