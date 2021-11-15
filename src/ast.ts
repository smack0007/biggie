export enum SyntaxKind {
  Block,

  FunctionDeclaration,

  Identifier,

  SourceFile,

  Statement,

  TypeName,
}

export interface SourceFile {
  readonly kind: SyntaxKind.SourceFile;

  readonly fileName: string;

  readonly statements: Array<Statement>;
}

export interface Statement {
  readonly kind: SyntaxKind;
}

export interface FunctionDeclaration extends Statement {
  readonly kind: SyntaxKind.FunctionDeclaration;

  readonly body: Block;

  readonly name: Identifier;

  readonly returnType: TypeName;
}

export interface Block {
  readonly kind: SyntaxKind.Block;

  readonly statements: Array<Statement>;
}

export interface Identifier {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface TypeName {
  readonly kind: SyntaxKind.TypeName;

  readonly name: Identifier;
}
