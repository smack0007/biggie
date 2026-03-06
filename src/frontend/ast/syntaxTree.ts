import { TextPosition } from "../program.ts";
import * as symbols from "../symbols.ts";

export enum SyntaxKind {
  AdditiveExpression,

  ArrayLiteral,

  ArrayType,

  AssignmentExpression,

  BooleanLiteral,

  CallExpression,

  ComparisonExpression,

  DeferStatement,

  ElementAccessExpression,

  EnumDeclaration,

  EnumMember,

  EqualityExpression,

  Expression,

  ExpressionStatement,

  FunctionArgument,

  FunctionDeclaration,

  Identifier,

  IfStatement,

  ImportDeclaration,

  IntegerLiteral,

  LogicalExpression,

  MultiplicativeExpression,

  ParenthesizedExpression,

  PointerType,

  PropertyAccessExpression,

  QualifiedName,

  ReturnStatement,

  SourceFile,

  Statement,

  StatementBlock,

  StringLiteral,

  StructDeclaration,

  StructLiteral,

  StructLiteralElement,

  StructMember,

  TypeReference,

  UnaryExpression,

  VariableDeclaration,

  WhileStatement,
}

export enum Operator {
  Ampersand,

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
  kind: SyntaxKind;

  startPos: TextPosition;

  endPos: TextPosition;

  parent?: SyntaxNode;
}

export interface SourceFile extends SyntaxNode, symbols.SymbolScope {
  kind: SyntaxKind.SourceFile;

  fileName: string;

  statements: Statement[];

  exports?: symbols.SymbolTable;
}

export interface Statement extends SyntaxNode {}

export interface ImportDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.ImportDeclaration;

  alias?: Identifier;

  module: StringLiteral;

  resolvedFileName: string;
}

export interface VariableDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.VariableDeclaration;

  name: Identifier;

  type: TypeNode;

  initializer?: Expression;
}

export interface EnumDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.EnumDeclaration;

  isExported: boolean;

  name: Identifier;

  members: EnumMember[];
}

export interface EnumMember extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.EnumMember;

  name: Identifier;

  initializer?: Expression;
}

export interface FunctionDeclaration extends SyntaxNode, symbols.SymbolDeclaration, symbols.SymbolScope {
  kind: SyntaxKind.FunctionDeclaration;

  isExported: boolean;

  name: Identifier;

  arguments: VariableDeclaration[];

  returnType: TypeNode;

  body: StatementBlock;
}

export interface StructDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.StructDeclaration;

  isExported: boolean;

  name: Identifier;

  members: StructMember[];
}

export interface StructMember extends SyntaxNode, symbols.SymbolDeclaration {
  kind: SyntaxKind.StructMember;

  name: Identifier;

  type: Identifier;
}

export interface ExpressionStatement extends Statement {
  kind: SyntaxKind.ExpressionStatement;

  expression: Expression;
}

export interface DeferStatement extends Statement {
  kind: SyntaxKind.DeferStatement;

  body: Statement;
}

export interface IfStatement extends Statement {
  kind: SyntaxKind.IfStatement;

  condition: Expression;

  then: Statement;

  else?: Statement;
}

export interface WhileStatement extends Statement {
  kind: SyntaxKind.WhileStatement;

  condition: Expression;

  body: Statement;
}

export interface ReturnStatement extends Statement {
  kind: SyntaxKind.ReturnStatement;

  expression: Expression;
}

export interface StatementBlock extends SyntaxNode, symbols.SymbolScope {
  kind: SyntaxKind.StatementBlock;

  statements: Statement[];
}

export interface Expression extends SyntaxNode, symbols.SymbolReference {}

export interface LogicalExpression extends Expression {
  kind: SyntaxKind.LogicalExpression;

  lhs: Expression;

  operator: Operator.AmpersandAmpersand | Operator.BarBar;

  rhs: Expression;
}

export interface AssignmentExpression extends Expression {
  kind: SyntaxKind.AssignmentExpression;

  name: Identifier;

  operator:
    | Operator.Equals
    | Operator.PlusEquals
    | Operator.MinusEquals
    | Operator.AsteriskEquals
    | Operator.SlashEquals;

  value: Expression;
}

export interface EqualityExpression extends Expression {
  kind: SyntaxKind.EqualityExpression;

  lhs: Expression;

  operator: Operator.EqualsEquals | Operator.ExclamationEquals;

  rhs: Expression;
}

export interface ComparisonExpression extends Expression {
  kind: SyntaxKind.ComparisonExpression;

  lhs: Expression;

  operator: Operator.GreaterThan | Operator.GreaterThanEquals | Operator.LessThan | Operator.LessThanEquals;

  rhs: Expression;
}

export interface AdditiveExpression extends Expression {
  kind: SyntaxKind.AdditiveExpression;

  lhs: Expression;

  operator: Operator.Plus | Operator.Minus;

  rhs: Expression;
}

export interface MultiplicativeExpression extends Expression {
  kind: SyntaxKind.MultiplicativeExpression;

  lhs: Expression;

  operator: Operator.Asterisk | Operator.Slash;

  rhs: Expression;
}

export interface UnaryExpression extends Expression {
  kind: SyntaxKind.UnaryExpression;

  operator: Operator.Ampersand | Operator.Asterisk | Operator.Exclamation | Operator.Minus;

  expression: Expression;
}

export interface ParenthesizedExpression extends Expression {
  kind: SyntaxKind.ParenthesizedExpression;

  expression: Expression;
}

export interface CallExpression extends Expression {
  kind: SyntaxKind.CallExpression;

  expression: Expression;

  arguments: Expression[];
}

export interface ElementAccessExpression extends Expression {
  kind: SyntaxKind.ElementAccessExpression;

  expression: Expression;

  argumentExpression: Expression;
}

export interface PropertyAccessExpression extends Expression {
  kind: SyntaxKind.PropertyAccessExpression;

  expression: Expression;

  name: Identifier;
}

export interface TypeNode extends SyntaxNode {}

export interface ArrayType extends TypeNode {
  kind: SyntaxKind.ArrayType;

  elementType: TypeNode;
}

export interface PointerType extends TypeNode {
  kind: SyntaxKind.PointerType;

  elementType: TypeNode;
}

export interface TypeReference extends TypeNode {
  kind: SyntaxKind.TypeReference;

  typeName: QualifiedName | Identifier;
}

export interface QualifiedName extends SyntaxNode {
  kind: SyntaxKind.QualifiedName;

  left: Identifier;

  right: Identifier;
}

export interface Identifier extends Expression, symbols.SymbolReference {
  kind: SyntaxKind.Identifier;

  value: string;
}

export interface ArrayLiteral extends Expression {
  kind: SyntaxKind.ArrayLiteral;

  elements: Expression[];
}

export interface StructLiteral extends Expression {
  kind: SyntaxKind.StructLiteral;

  elements: StructLiteralElement[];
}

export interface StructLiteralElement extends SyntaxNode {
  kind: SyntaxKind.StructLiteralElement;

  name?: Identifier;

  expression: Expression;
}

export interface BooleanLiteral extends Expression {
  kind: SyntaxKind.BooleanLiteral;

  value: boolean;
}

export interface IntegerLiteral extends Expression {
  kind: SyntaxKind.IntegerLiteral;

  value: string;
}

export interface StringLiteral extends Expression {
  kind: SyntaxKind.StringLiteral;

  value: string;
}
