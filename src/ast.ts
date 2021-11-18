export enum SyntaxKind {
  Expression,

  ExpressionStatement,

  FunctionDeclaration,

  Identifier,

  SourceFile,

  ReturnStatement,

  Statement,

  StatementBlock,

  TypeName,
}

export interface SyntaxTrivia {
  readonly value: string;
}

export interface SyntaxNode {
  readonly kind: SyntaxKind;

  readonly leadingTrivia?: SyntaxTrivia | null;

  readonly trailingTrivia?: SyntaxTrivia | null;
}

export interface SourceFile extends SyntaxNode {
  readonly kind: SyntaxKind.SourceFile;

  readonly fileName: string;

  readonly statements: Array<Statement>;
}

export interface Statement extends SyntaxNode {
  readonly kind: SyntaxKind;
}

export interface FunctionDeclaration extends Statement {
  readonly kind: SyntaxKind.FunctionDeclaration;

  readonly body: StatementBlock;

  readonly name: Identifier;

  readonly returnType: TypeName;
}

export interface ExpressionStatement extends Statement {
  readonly kind: SyntaxKind.ExpressionStatement;

  readonly expression: Expression;
}

export interface ReturnStatement extends Statement {
  readonly kind: SyntaxKind.ReturnStatement;

  readonly expression: Expression;
}

export interface StatementBlock extends SyntaxNode {
  readonly kind: SyntaxKind.StatementBlock;

  readonly statements: Array<Statement>;
}

export interface Expression extends SyntaxNode {
  readonly kind: SyntaxKind.Expression;

  readonly value: string;
}

export interface Identifier extends SyntaxNode {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface TypeName extends SyntaxNode {
  readonly kind: SyntaxKind.TypeName;

  readonly name: Identifier;
}
