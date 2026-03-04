import * as ast from "./ast/mod.ts";
import { Program, ProgramDiagnostic, TextPosition } from "./program.ts";
import { bool, error, ErrorResult, isError, isSuccess, nameof, Result, success } from "../shims.ts";
import { Symbol, SymbolFlags, SymbolScope, SymbolTable } from "./symbols.ts";

export enum BindErrorKind {
  Unexpected,
  MissingSymbol,
}

export interface BindError extends ProgramDiagnostic {
  kind: BindErrorKind;
  message: string;
  fileName: string;
  pos: TextPosition;
}

function bindError(kind: BindErrorKind, message: string, node: ast.SyntaxNode): ErrorResult<BindError> {
  const sourceFile = getSourceFileFromNode(node);

  return error({
    kind,
    message,
    fileName: isSuccess(sourceFile) ? sourceFile.value.fileName : "",
    pos: node.startPos,
  });
}

export function bind(program: Program): Result<void, BindError> {
  let result = bindInitialize(program);

  if (isError(result)) {
    return result;
  }

  for (const sourceFile of Object.values(program.sourceFiles)) {
    result = bindSourceFile(program, <Required<ast.SourceFile>> sourceFile);

    if (isError(result)) {
      return result;
    }
  }

  return success();
}

const SYMBOL_SCOPE_SYNTAX_KIND = [
  ast.SyntaxKind.SourceFile,
  ast.SyntaxKind.FunctionDeclaration,
  ast.SyntaxKind.StatementBlock,
];

function bindInitialize(program: Program): Result<void, BindError> {
  for (const sourceFile of Object.values(program.sourceFiles)) {
    sourceFile.locals = {};
    sourceFile.exports = {};

    const result = ast.walkChildren(
      sourceFile,
      (node: ast.SyntaxNode, parent: ast.SyntaxNode): Result<bool, BindError> => {
        node.parent = parent;

        if (SYMBOL_SCOPE_SYNTAX_KIND.includes(node.kind)) {
          const scope = <SymbolScope> node;
          scope.locals = {};

          const nextSymbolScope = getParentNodeByKinds<Required<SymbolScope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);

          if (isError(nextSymbolScope)) {
            return nextSymbolScope;
          }

          scope.nextSymbolScope = nextSymbolScope.value;
        }

        return success(true);
      },
    );

    if (isError(result)) {
      return result;
    }
  }

  return success();
}

function getParentNodeByKinds<T>(node: ast.SyntaxNode, kinds: ast.SyntaxKind[]): Result<T, BindError> {
  if (node.parent == null) {
    return bindError(BindErrorKind.Unexpected, `${ast.SyntaxKind[node.kind]} node has no parent.`, node);
  }

  node = node.parent;
  while (!kinds.includes(node.kind) && node.parent != null) {
    node = node.parent;
  }

  if (!kinds.includes(node.kind)) {
    return bindError(
      BindErrorKind.Unexpected,
      `Failed to get parent node of ${kinds.map((x) => ast.SyntaxKind[x]).join(", ")}.`,
      node,
    );
  }

  return success(<T> node);
}

function getSourceFileFromNode(node: ast.SyntaxNode): Result<Required<ast.SourceFile>, BindError> {
  return getParentNodeByKinds<Required<ast.SourceFile>>(node, [ast.SyntaxKind.SourceFile]);
}

function getSymbolScopeFromNode(node: ast.SyntaxNode): Result<Required<SymbolScope>, BindError> {
  return getParentNodeByKinds<Required<SymbolScope>>(node, SYMBOL_SCOPE_SYNTAX_KIND);
}

function getSymbolByName(node: ast.SyntaxNode, name: string): Result<Symbol, BindError> {
  const scopeResult = getSymbolScopeFromNode(node);

  if (isError(scopeResult)) {
    return scopeResult;
  }

  let scope = scopeResult.value;

  while (scope.nextSymbolScope) {
    if (scope.locals[name]) {
      return success(scope.locals[name]);
    }
    scope = <Required<SymbolScope>> scope.nextSymbolScope;
  }

  if (scope.locals[name]) {
    return success(scope.locals[name]);
  }

  return bindError(BindErrorKind.MissingSymbol, `Failed to get symbol named "${name}".`, node);
}

function bindSourceFile(program: Program, sourceFile: Required<ast.SourceFile>): Result<void, BindError> {
  return ast.walk(sourceFile, (node: ast.SyntaxNode): Result<bool, BindError> => {
    let result: Result<void, BindError>;

    // TODO: All the cases in the switch should return false that binding only occurs once.
    switch (node.kind) {
      case ast.SyntaxKind.ImportDeclaration:
        result = bindImportDeclaration(program, sourceFile, <ast.ImportDeclaration> node);

        if (isError(result)) {
          return result;
        }

        return success(false);

      case ast.SyntaxKind.EnumDeclaration:
        result = bindEnumDeclaration(program, sourceFile, <ast.EnumDeclaration> node);

        if (isError(result)) {
          return result;
        }

        return success(false);

      case ast.SyntaxKind.FunctionDeclaration:
        result = bindFunctionDeclaration(program, sourceFile, <ast.FunctionDeclaration> node);

        if (isError(result)) {
          return result;
        }

        return success(true);

      case ast.SyntaxKind.StructDeclaration:
        result = bindStructDeclaration(program, sourceFile, <ast.StructDeclaration> node);

        if (isError(result)) {
          return result;
        }

        return success(false);

      case ast.SyntaxKind.VariableDeclaration:
        result = bindVariableDeclaration(program, sourceFile, <ast.VariableDeclaration> node);

        if (isError(result)) {
          return result;
        }

        return success(false);

      case ast.SyntaxKind.PropertyAccessExpression:
        result = bindPropertyAccessExpression(program, sourceFile, <ast.PropertyAccessExpression> node);

        if (isError(result)) {
          return result;
        }

        return success(true);

      // Just ignoring types for now.
      case ast.SyntaxKind.TypeReference:
        return success(false);
    }

    return success(true);
  });
}

function bindImportDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  importStatement: ast.ImportDeclaration,
): Result<void, BindError> {
  const moduleAlias = ast.getOrCalculateModuleAlias(importStatement);
  const members = program.sourceFiles[importStatement.resolvedFileName].exports;

  importStatement.symbol = {
    sourceFileName: sourceFile.fileName,
    name: moduleAlias,
    flags: SymbolFlags.Module,
    members,
  };

  sourceFile.locals[moduleAlias] = importStatement.symbol!;

  return success();
}

function bindEnumDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  enumDeclaration: ast.EnumDeclaration,
): Result<void, BindError> {
  const members: SymbolTable = {};
  for (const enumMember of enumDeclaration.members) {
    const result = bindEnumMember(program, sourceFile, enumMember);

    if (isError(result)) {
      return result;
    }

    members[enumMember.symbol!.name] = enumMember.symbol!;
  }

  enumDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumDeclaration.name.value,
    flags: SymbolFlags.Enum,
    members,
  };

  sourceFile.locals[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  if (enumDeclaration.isExported) {
    sourceFile.exports[enumDeclaration.symbol!.name] = enumDeclaration.symbol!;
  }

  return success();
}

function bindEnumMember(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  enumMember: ast.EnumMember,
): Result<void, BindError> {
  enumMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: enumMember.name.value,
    flags: SymbolFlags.EnumMember,
  };

  return success();
}

function bindFunctionDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  functionDeclaration: ast.FunctionDeclaration,
): Result<void, BindError> {
  functionDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: functionDeclaration.name.value,
    flags: SymbolFlags.Function,
  };

  sourceFile.locals[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  if (functionDeclaration.isExported) {
    sourceFile.exports[functionDeclaration.symbol!.name] = functionDeclaration.symbol!;
  }

  return success();
}

function bindStructDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  structDeclaration: ast.StructDeclaration,
): Result<void, BindError> {
  const members: SymbolTable = {};
  for (const structMember of structDeclaration.members) {
    const result = bindStructMember(program, sourceFile, structMember);

    if (isError(result)) {
      return result;
    }

    members[structMember.symbol!.name] = structMember.symbol!;
  }

  structDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structDeclaration.name.value,
    flags: SymbolFlags.Variable,
    members,
  };

  sourceFile.locals[structDeclaration.symbol!.name] = structDeclaration.symbol!;
  if (structDeclaration.isExported) {
    sourceFile.exports[structDeclaration.name.value] = structDeclaration.symbol!;
  }

  return success();
}

function bindStructMember(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  structMember: ast.StructMember,
): Result<void, BindError> {
  structMember.symbol = {
    sourceFileName: sourceFile.fileName,
    name: structMember.name.value,
    flags: SymbolFlags.StructMember,
  };

  return success();
}

function bindVariableDeclaration(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  variableDeclaration: ast.VariableDeclaration,
): Result<void, BindError> {
  let members: SymbolTable | undefined;

  if (variableDeclaration.type.kind == ast.SyntaxKind.TypeReference) {
    const typeReference = <ast.TypeReference> variableDeclaration.type;
    if (typeReference.typeName.kind == ast.SyntaxKind.QualifiedName) {
      const qualifiedName = <ast.QualifiedName> typeReference.typeName;

      const module = getSymbolByName(variableDeclaration, qualifiedName.left.value);

      if (isError(module)) {
        return module;
      }

      // TODO: Check members is set

      const moduleExport = module.value.members![qualifiedName.right.value];

      // TODO: Check members is set.

      members = moduleExport.members;
    } else {
      const identifier = <ast.Identifier> typeReference.typeName;

      // HACK: Ignore int32 for now.
      if (identifier.value != "int32") {
        const symbol = getSymbolByName(variableDeclaration, identifier.value);

        if (isError(symbol)) {
          return symbol;
        }

        members = symbol.value.members;
      }
    }
  }

  variableDeclaration.symbol = {
    sourceFileName: sourceFile.fileName,
    name: variableDeclaration.name.value,
    flags: SymbolFlags.Variable,
    members,
  };

  const scope = getSymbolScopeFromNode(variableDeclaration);

  if (isError(scope)) {
    return scope;
  }

  scope.value.locals[variableDeclaration.symbol!.name] = variableDeclaration.symbol!;

  return success();
}

function bindPropertyAccessExpression(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  propertyAccessExpression: ast.PropertyAccessExpression,
): Result<void, BindError> {
  let lhsSymbol: Symbol | undefined;

  if (propertyAccessExpression.expression.kind == ast.SyntaxKind.Identifier) {
    const leftIdentifier = <ast.Identifier> propertyAccessExpression.expression;
    const result = bindIdentifier(program, sourceFile, leftIdentifier);

    if (isError(result)) {
      return result;
    }

    lhsSymbol = leftIdentifier.symbol;
  } else if (propertyAccessExpression.expression.kind == ast.SyntaxKind.PropertyAccessExpression) {
    const leftPropertyAccessExpression = <ast.PropertyAccessExpression> propertyAccessExpression.expression;
    const result = bindPropertyAccessExpression(program, sourceFile, leftPropertyAccessExpression);

    if (isError(result)) {
      return result;
    }

    lhsSymbol = leftPropertyAccessExpression.symbol;
  } else {
    return bindError(
      BindErrorKind.Unexpected,
      `Unexpected lhs expression in ${nameof(bindPropertyAccessExpression)}: ${
        ast.SyntaxKind[propertyAccessExpression.expression.kind]
      }`,
      propertyAccessExpression,
    );
  }

  if (!lhsSymbol) {
    return bindError(
      BindErrorKind.Unexpected,
      `LHS symbol in ${nameof(bindPropertyAccessExpression)} is null.`,
      propertyAccessExpression,
    );
  }

  const result = bindIdentifier(program, sourceFile, propertyAccessExpression.name, lhsSymbol);

  if (isError(result)) {
    return result;
  }

  propertyAccessExpression.symbol = propertyAccessExpression.name.symbol;

  return success();
}

function bindIdentifier(
  program: Program,
  sourceFile: Required<ast.SourceFile>,
  identifier: ast.Identifier,
  parentSymbol?: Symbol,
): Result<void, BindError> {
  if (identifier.symbol) {
    return success();
  }

  // HACK: Ignore println for now.
  if (identifier.value == "println") {
    return success();
  }

  if (!parentSymbol) {
    const symbol = getSymbolByName(identifier, identifier.value);

    if (isError(symbol)) {
      return symbol;
    }

    identifier.symbol = symbol.value;
  } else {
    if (!parentSymbol.members) {
      return bindError(
        BindErrorKind.Unexpected,
        `parentSymbol.members is null in ${nameof(bindIdentifier)}: ${identifier.value}`,
        identifier,
      );
    }

    if (!parentSymbol.members[identifier.value]) {
      return bindError(
        BindErrorKind.MissingSymbol,
        `Failed to get member symbol ${identifier.value} from ${parentSymbol.name}`,
        identifier,
      );
    }

    identifier.symbol = parentSymbol.members[identifier.value];
  }

  return success();
}
