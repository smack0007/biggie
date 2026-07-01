import { uint } from "../../shims.ts";

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

  ExpressionStatement,

  FuncArgument,

  FuncDeclaration,

  Identifier,

  IfStatement,

  ImportDeclaration,

  IntegerLiteral,

  LogicalExpression,

  MultiplicativeExpression,

  ParenthesizedExpression,

  PointerType,

  Program,

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

  VarDeclaration,

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

export interface TextPosition {
  line: uint;
  column: uint;
}

export interface SyntaxNode {
  kind: SyntaxKind;

  startPos: TextPosition;

  endPos: TextPosition;

  parent?: SyntaxNode;
}

export enum BindState {
  Uninitialized = 0,

  Initialized = 1,

  Finished = 2,
}

export enum BindFlags {
  None = 0,

  Builtin = 1 << 0,

  Module = 1 << 1,

  Type = 1 << 2,

  Var = 1 << 3,

  Enum = 1 << 4,

  EnumMember = 1 << 5,

  Func = 1 << 6,

  Struct = 1 << 7,

  StructMember = 1 << 8,

  Method = 1 << 9,
}

export type SymbolTable = Record<string, Symbol>;

export interface Symbol {
  parent?: Symbol;

  sourceFileName: string;

  name: string;

  flags: BindFlags;

  members?: SymbolTable;
}

export interface BindNode extends SyntaxNode {
  bindState: BindState;
}

export interface Declaration extends BindNode {
  symbol?: Symbol;
}

export interface Reference extends BindNode {
  symbol?: Symbol;
}

export interface Scope extends BindNode {
  locals: SymbolTable;

  nextSymbolScope?: Scope;
}

export interface Diagnostic {
  // The fileName of the source file the diagnositic is associated with.
  fileName: string;

  // The position in the source file.
  pos: TextPosition;

  // The message of the diagnostic.
  message: string;
}

export interface Program extends SyntaxNode, Scope {
  kind: SyntaxKind.Program;

  // Path to the entry source file.
  entryFileName: string;

  // Map of [sourceFilePath] => SourceFile
  sourceFiles: Record<string, SourceFile>;

  diagnostics: Diagnostic[];
}

export interface SourceFile extends SyntaxNode, Scope {
  kind: SyntaxKind.SourceFile;

  fileName: string;

  statements: Statement[];

  exports: SymbolTable;
}

export interface Statement extends SyntaxNode {}

export interface ImportDeclaration extends SyntaxNode, Declaration {
  kind: SyntaxKind.ImportDeclaration;

  alias?: Identifier;

  module: StringLiteral;

  resolvedFileName: string;
}

export interface VarDeclaration extends SyntaxNode, Declaration {
  kind: SyntaxKind.VarDeclaration;

  name: Identifier;

  type: TypeNode;

  initializer?: Expression;
}

export interface EnumDeclaration extends SyntaxNode, Declaration {
  kind: SyntaxKind.EnumDeclaration;

  isExported: boolean;

  name: Identifier;

  members: EnumMember[];
}

export interface EnumMember extends SyntaxNode, Declaration {
  kind: SyntaxKind.EnumMember;

  name: Identifier;

  initializer?: Expression;
}

export interface FuncDeclaration extends SyntaxNode, Declaration, Scope {
  kind: SyntaxKind.FuncDeclaration;

  isExported: boolean;

  name: Identifier;

  arguments: VarDeclaration[];

  returnType: TypeNode;

  body: StatementBlock;
}

export interface StructDeclaration extends SyntaxNode, Declaration {
  kind: SyntaxKind.StructDeclaration;

  isExported: boolean;

  name: Identifier;

  members: StructMember[];
}

export interface StructMember extends SyntaxNode, Declaration {
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

export interface StatementBlock extends SyntaxNode, Scope {
  kind: SyntaxKind.StatementBlock;

  statements: Statement[];
}

export interface Expression extends SyntaxNode, Reference {}

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

export interface TypeNode extends SyntaxNode, Reference {}

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

export interface QualifiedName extends SyntaxNode, Reference {
  kind: SyntaxKind.QualifiedName;

  left: Identifier;

  right: Identifier;
}

export interface Identifier extends Expression, Reference {
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
