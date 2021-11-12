import { arr } from "./types";

export enum SyntaxKind {
  FunctionDeclaration,

  SourceFile,

  Statement
}

export interface SourceFile {
  readonly type: SyntaxKind.SourceFile;
  
  readonly fileName: string;

  statements: arr<Statement>;
}

export interface Statement {
  readonly type: SyntaxKind;
}

export interface FunctionDeclaration extends Statement {
  readonly type: SyntaxKind.FunctionDeclaration;
}