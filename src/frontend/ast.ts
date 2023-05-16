export enum SyntaxKind {
  CallExpression,

  Expression,

  ExpressionStatement,

  IntegerLiteral,

  FuncArgument,

  FuncDeclaration,

  Identifier,

  DeferStatement,

  ReturnStatement,
  
  SourceFile,

  Statement,

  StatementBlock,

  StringLiteral,

  TypeName,

  VarDeclaration,
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

export interface VarDeclaration extends Statement {
  readonly kind: SyntaxKind.VarDeclaration;

  readonly name: Identifier;

  readonly expression?: Expression;
}

export interface FuncDeclaration extends Statement {
  readonly kind: SyntaxKind.FuncDeclaration;

  readonly body: StatementBlock;

  readonly name: Identifier;

  readonly arguments: Array<FunctionArgument>;

  readonly returnType: TypeName;
}

export interface FunctionArgument extends SyntaxNode {
  readonly kind: SyntaxKind.FuncArgument;
  
  readonly name: Identifier;

  readonly type: Identifier;
}

export interface ExpressionStatement extends Statement {
  readonly kind: SyntaxKind.ExpressionStatement;

  readonly expression: Expression;
}

export interface DeferStatement extends Statement {
  readonly kind: SyntaxKind.DeferStatement;

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

export interface Expression extends SyntaxNode {}

export interface CallExpression extends Expression {
  readonly kind: SyntaxKind.CallExpression;

  readonly expression: Expression;

  readonly arguments: Array<Expression>;
}

export interface TypeName extends Expression {
  readonly kind: SyntaxKind.TypeName;

  readonly name: Identifier;
}

export interface Identifier extends SyntaxNode {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface IntegerLiteral extends Expression {
  readonly kind: SyntaxKind.IntegerLiteral;

  readonly value: string;
}

export interface StringLiteral extends Expression {
  readonly kind: SyntaxKind.StringLiteral;

  readonly value: string;
}
