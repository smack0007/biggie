import { TextPosition } from "./scanner.ts";
import * as symbols from "./symbols.ts";

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
  readonly kind: SyntaxKind;

  readonly startPos: TextPosition;

  readonly endPos: TextPosition;

  readonly parent?: SyntaxNode;
}

export interface SourceFile extends SyntaxNode, symbols.SymbolScope {
  readonly kind: SyntaxKind.SourceFile;

  readonly fileName: string;

  readonly statements: Statement[];

  readonly exports?: symbols.SymbolTable;
}

export interface Statement extends SyntaxNode {}

export interface ImportDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.ImportDeclaration;

  readonly alias?: Identifier;

  readonly module: StringLiteral;

  readonly resolvedFileName: string;
}

export interface VariableDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.VariableDeclaration;

  readonly name: Identifier;

  readonly type: TypeNode;

  readonly initializer?: Expression;
}

export interface EnumDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.EnumDeclaration;

  readonly isExported: boolean;

  readonly name: Identifier;

  readonly members: EnumMember[];
}

export interface EnumMember extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.EnumMember;

  readonly name: Identifier;

  readonly initializer?: Expression;
}

export interface FunctionDeclaration extends SyntaxNode, symbols.SymbolDeclaration, symbols.SymbolScope {
  readonly kind: SyntaxKind.FunctionDeclaration;

  readonly isExported: boolean;

  readonly name: Identifier;

  readonly arguments: VariableDeclaration[];

  readonly returnType: TypeNode;

  readonly body: StatementBlock;
}

export interface StructDeclaration extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.StructDeclaration;

  readonly isExported: boolean;

  readonly name: Identifier;

  readonly members: StructMember[];
}

export interface StructMember extends SyntaxNode, symbols.SymbolDeclaration {
  readonly kind: SyntaxKind.StructMember;

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

export interface StatementBlock extends SyntaxNode, symbols.SymbolScope {
  readonly kind: SyntaxKind.StatementBlock;

  readonly statements: Statement[];
}

export interface Expression extends SyntaxNode, symbols.SymbolReference {}

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

export interface MultiplicativeExpression extends Expression {
  readonly kind: SyntaxKind.MultiplicativeExpression;

  readonly lhs: Expression;

  readonly operator: Operator.Asterisk | Operator.Slash;

  readonly rhs: Expression;
}

export interface UnaryExpression extends Expression {
  readonly kind: SyntaxKind.UnaryExpression;

  readonly operator: Operator.Ampersand | Operator.Asterisk | Operator.Exclamation | Operator.Minus;

  readonly expression: Expression;
}

export interface ParenthesizedExpression extends Expression {
  readonly kind: SyntaxKind.ParenthesizedExpression;

  readonly expression: Expression;
}

export interface CallExpression extends Expression {
  readonly kind: SyntaxKind.CallExpression;

  readonly expression: Expression;

  readonly arguments: Expression[];
}

export interface ElementAccessExpression extends Expression {
  readonly kind: SyntaxKind.ElementAccessExpression;

  readonly expression: Expression;

  readonly argumentExpression: Expression;
}

export interface PropertyAccessExpression extends Expression {
  readonly kind: SyntaxKind.PropertyAccessExpression;

  readonly expression: Expression;

  readonly name: Identifier;
}

export interface TypeNode extends SyntaxNode {}

export interface ArrayType extends TypeNode {
  readonly kind: SyntaxKind.ArrayType;

  readonly elementType: TypeNode;
}

export interface PointerType extends TypeNode {
  readonly kind: SyntaxKind.PointerType;

  readonly elementType: TypeNode;
}

export interface TypeReference extends TypeNode {
  readonly kind: SyntaxKind.TypeReference;

  readonly typeName: QualifiedName | Identifier;
}

export interface QualifiedName extends SyntaxNode {
  readonly kind: SyntaxKind.QualifiedName;

  readonly left: Identifier;

  readonly right: Identifier;
}

// TODO: Should Identifier be an Expression?
export interface Identifier extends SyntaxNode, symbols.SymbolReference {
  readonly kind: SyntaxKind.Identifier;

  readonly value: string;
}

export interface ArrayLiteral extends Expression {
  readonly kind: SyntaxKind.ArrayLiteral;

  readonly elements: Expression[];
}

export interface StructLiteral extends Expression {
  readonly kind: SyntaxKind.StructLiteral;

  readonly elements: StructLiteralElement[];
}

export interface StructLiteralElement extends SyntaxNode {
  readonly kind: SyntaxKind.StructLiteralElement;

  readonly name?: Identifier;

  readonly expression: Expression;
}

export interface BooleanLiteral extends Expression {
  readonly kind: SyntaxKind.BooleanLiteral;

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
