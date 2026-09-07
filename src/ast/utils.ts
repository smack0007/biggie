import * as path from "node:path";
import * as assert from "../assert.ts";
import {
  Declaration,
  Expression,
  ImportDeclaration,
  Program,
  Reference,
  Scope,
  SourceFile,
  Statement,
  SyntaxNode,
} from "./syntaxTree.ts";
import { isProgram, isScope, isSourceFile } from "./typeGuards.ts";
import { nameofSymbolKind, nameofSyntaxKind } from "./nameof.ts";
import {
  makeExpressionStatement,
  makeFuncDeclaration,
  makeIdentifier,
  makeProgram,
  makeSourceFile,
  makeStatementBlock,
  makeTypeReference,
} from "./syntaxTreeFactories.ts";
import { bool } from "../shims.ts";
import { Symbol, SymbolKind } from "./symbols.ts";

export const SOURCE_FILE_NAME = "<source>";

function findNodeByTypeGuard<T>(node: SyntaxNode, typeGuard: (node: SyntaxNode) => bool): T | null {
  while (!typeGuard(node) && node.parent != null) {
    node = node.parent;
  }

  if (!typeGuard(node)) {
    return null;
  }

  return <T> node;
}

export function findProgramFromNode(node: SyntaxNode): Program | null {
  return findNodeByTypeGuard(node, isProgram);
}

export function findScopeFromNode(node: SyntaxNode): Scope | null {
  return findNodeByTypeGuard(node, isScope);
}

export function findSourceFileFromNode(node: SyntaxNode): SourceFile | null {
  return findNodeByTypeGuard(node, isSourceFile);
}

export function getModulePrefixByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}

// TODO(symbols): Remove this function.
export function getSymbol(node: Declaration<Symbol> | Reference, kind: SymbolKind): Symbol {
  assert.notNull(node.symbol, `symbol is null in ${nameofSyntaxKind(node.kind)} node`);

  assert.areEqual(
    node.symbol.kind,
    kind,
    `symbol did not have expected kind ${nameofSymbolKind(kind)} in ${nameofSyntaxKind(node.kind)} node`,
  );

  return node.symbol;
}

export interface MakeProgramFromOptions {
  topLevelStatements?: Statement[];
}

export function makeProgramFromExpression(expression: Expression, options: MakeProgramFromOptions = {}): Program {
  return makeProgram(
    SOURCE_FILE_NAME,
    {
      [SOURCE_FILE_NAME]: makeSourceFile(SOURCE_FILE_NAME, [
        ...(options.topLevelStatements ?? []),
        makeFuncDeclaration(
          makeIdentifier("main"),
          [],
          makeTypeReference(makeIdentifier("void")),
          makeStatementBlock([
            makeExpressionStatement(expression),
          ]),
        ),
      ], {}),
    },
  );
}

export function makeProgramFromStatement(statement: Statement, options: MakeProgramFromOptions = {}): Program {
  return makeProgram(
    SOURCE_FILE_NAME,
    {
      [SOURCE_FILE_NAME]: makeSourceFile(SOURCE_FILE_NAME, [
        ...(options.topLevelStatements ?? []),
        makeFuncDeclaration(
          makeIdentifier("main"),
          [],
          makeTypeReference(makeIdentifier("void")),
          makeStatementBlock([
            statement,
          ]),
        ),
      ], {}),
    },
  );
}

export function makeProgramFromTopLevelStatements(
  statements: Statement[],
  options: MakeProgramFromOptions = {},
): Program {
  return makeProgram(
    SOURCE_FILE_NAME,
    {
      [SOURCE_FILE_NAME]: makeSourceFile(SOURCE_FILE_NAME, [
        ...statements,
        ...(options.topLevelStatements ?? []),
      ], {}),
    },
  );
}
