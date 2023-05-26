export enum SyntaxKind {
  AdditiveExpression,

  BoolLiteral,
  
  CallExpression,

  ComparisonExpression,

  DeferStatement,

  EqualityExpression,

  Expression,

  ExpressionStatement,

  IntegerLiteral,

  FuncArgument,

  FuncDeclaration,

  Identifier,

  MultiplicativeExpression,

  ParenthesizedExpression,

  ReturnStatement,

  SourceFile,

  Statement,

  StatementBlock,

  StringLiteral,

  TypeName,

  UnaryExpression,

  VarDeclaration,
}

export enum BinaryOperator {
  Add,
  
  Divide,

  EqualTo,

  GreaterThan,

  GreaterThanOrEqualTo,

  LessThan,

  LessThanOrEqualTo,

  Multiply,

  NotEqualTo,

  Subtract
}

export enum UnaryOperator {
  Negate,

  LogicalNegate
}

export interface SyntaxNode {
  readonly kind: SyntaxKind;
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

export interface EqualityExpression extends Expression {
  readonly kind: SyntaxKind.EqualityExpression;

  readonly lhs: Expression;

  readonly operator: BinaryOperator.EqualTo | BinaryOperator.NotEqualTo;

  readonly rhs: Expression;
}

export interface ComparisonExpression extends Expression {
  readonly kind: SyntaxKind.ComparisonExpression;

  readonly lhs: Expression;

  readonly operator: BinaryOperator.GreaterThan | BinaryOperator.GreaterThanOrEqualTo | BinaryOperator.LessThan | BinaryOperator.LessThanOrEqualTo;

  readonly rhs: Expression;
}

export interface AdditiveExpression extends Expression {
  readonly kind: SyntaxKind.AdditiveExpression;

  readonly lhs: Expression;

  readonly operator: BinaryOperator.Add | BinaryOperator.Subtract;

  readonly rhs: Expression;
}

export interface MultiplcativeExpression extends Expression {
  readonly kind: SyntaxKind.MultiplicativeExpression;

  readonly lhs: Expression;

  readonly operator: BinaryOperator.Multiply | BinaryOperator.Divide;

  readonly rhs: Expression;
}

export interface UnaryExpression extends Expression {
  readonly kind: SyntaxKind.UnaryExpression;

  readonly operator: UnaryOperator;

  readonly expression: Expression;
}

export interface ParenthesizedExpression extends Expression {
  readonly kind: SyntaxKind.ParenthesizedExpression;

  readonly expression: Expression;
}

export interface CallExpression extends Expression {
  readonly kind: SyntaxKind.CallExpression;

  readonly expression: Expression;

  readonly arguments: Array<Expression>;
}

export interface TypeName extends SyntaxNode {
  readonly kind: SyntaxKind.TypeName;

  readonly name: Identifier;
}

export interface Identifier extends SyntaxNode {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface BoolLiteral extends Expression {
  readonly kind: SyntaxKind.BoolLiteral;

  readonly value: boolean;
}

export interface IntegerLiteral extends Expression {
  readonly kind: SyntaxKind.IntegerLiteral;

  readonly value: string;
}

export interface StringLiteral extends Expression {
  readonly kind: SyntaxKind.StringLiteral;

  readonly value: string;
}
