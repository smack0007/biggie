export enum SyntaxKind {
  FunctionDeclaration,

  SourceFile,

  Statement,

  Identifier,

  TypeName
}

export interface SourceFile {
  readonly kind: SyntaxKind.SourceFile;

  readonly fileName: string;

  statements: Array<Statement>;
}

export interface Statement {
  readonly kind: SyntaxKind;
}

export interface FunctionDeclaration extends Statement {
  readonly kind: SyntaxKind.FunctionDeclaration;

  readonly name: Identifier;

  readonly returnType: TypeName;
}

export interface Identifier {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface TypeName {
  readonly kind: SyntaxKind.TypeName;

  readonly value: string;
}
