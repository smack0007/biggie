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

export interface StatementBlock {
  readonly kind: SyntaxKind.StatementBlock;

  readonly statements: Array<Statement>;
}

export interface Expression {
  readonly kind: SyntaxKind.Expression;

  readonly value: string;
}

export interface Identifier {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface TypeName {
  readonly kind: SyntaxKind.TypeName;

  readonly name: Identifier;
}
