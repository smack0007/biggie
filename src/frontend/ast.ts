// deno-lint-ignore-file no-empty-interface

export enum SyntaxKind {
  AdditiveExpression,

  AssignmentExpression,

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

  IfStatement,

  Identifier,

  LogicalExpression,

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

  WhileStatement,
}

export enum Operator {
  AmpersandAmpersand,

  Asterisk,

  AsteriskEquals,

  BarBar,

  Equals,

  EqualsEquals,

  Exclamation,

  ExclamationEquals,

  GreaterThan,

  GreaterThanEquals,

  LessThan,

  LessThanEquals,

  Minus,

  MinusEquals,

  Plus,

  PlusEquals,

  Slash,

  SlashEquals,
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

  readonly isConst: boolean;

  readonly name: Identifier;

  readonly type: TypeName;

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

  readonly body: Statement;
}

export interface IfStatement extends Statement {
  readonly kind: SyntaxKind.IfStatement;

  readonly condition: Expression;

  readonly then: Statement;

  readonly else?: Statement;
}

export interface WhileStatement extends Statement {
  readonly kind: SyntaxKind.WhileStatement;

  readonly condition: Expression;

  readonly body: Statement;
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

export interface LogicalExpression extends Expression {
  readonly kind: SyntaxKind.LogicalExpression;

  readonly lhs: Expression;

  readonly operator: Operator.AmpersandAmpersand | Operator.BarBar;

  readonly rhs: Expression;
}

export interface AssignmentExpression extends Expression {
  readonly kind: SyntaxKind.AssignmentExpression;

  readonly name: Identifier;

  readonly operator:
    | Operator.Equals
    | Operator.PlusEquals
    | Operator.MinusEquals
    | Operator.AsteriskEquals
    | Operator.SlashEquals;

  readonly value: Expression;
}

export interface EqualityExpression extends Expression {
  readonly kind: SyntaxKind.EqualityExpression;

  readonly lhs: Expression;

  readonly operator: Operator.EqualsEquals | Operator.ExclamationEquals;

  readonly rhs: Expression;
}

export interface ComparisonExpression extends Expression {
  readonly kind: SyntaxKind.ComparisonExpression;

  readonly lhs: Expression;

  readonly operator: Operator.GreaterThan | Operator.GreaterThanEquals | Operator.LessThan | Operator.LessThanEquals;

  readonly rhs: Expression;
}

export interface AdditiveExpression extends Expression {
  readonly kind: SyntaxKind.AdditiveExpression;

  readonly lhs: Expression;

  readonly operator: Operator.Plus | Operator.Minus;

  readonly rhs: Expression;
}

export interface MultiplcativeExpression extends Expression {
  readonly kind: SyntaxKind.MultiplicativeExpression;

  readonly lhs: Expression;

  readonly operator: Operator.Asterisk | Operator.Slash;

  readonly rhs: Expression;
}

export interface UnaryExpression extends Expression {
  readonly kind: SyntaxKind.UnaryExpression;

  readonly operator: Operator.Exclamation | Operator.Minus;

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
