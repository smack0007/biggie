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
import { nameofSymbolFlags, nameofSyntaxKind } from "./nameof.ts";
import {
  makeExpressionStatement,
  makeFuncDeclaration,
  makeIdentifier,
  makeProgram,
  makeSourceFile,
  makeStatementBlock,
  makeTypeReference,
} from "./factories.ts";
import { bool } from "../shims.ts";
import { Symbol, SymbolFlags, SymbolWithMembers } from "./symbols.ts";

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

export function getSymbol(node: Declaration | Reference, expectedFlags: SymbolFlags): Symbol {
  assert.notNull(node.symbol, `symbol is null in ${nameofSyntaxKind(node.kind)} node`);

  assert.hasFlag(
    node.symbol.flags,
    expectedFlags,
    `symbol did not have expected flag ${nameofSymbolFlags(expectedFlags)} in ${nameofSyntaxKind(node.kind)} node`,
  );

  return node.symbol;
}

export function getSymbolWithMembers(node: Declaration | Reference, expectedFlags: SymbolFlags): SymbolWithMembers {
  const symbol = getSymbol(node, expectedFlags);

  assert.notNull((<SymbolWithMembers> symbol).members, "symbol does not have memebers");

  return <SymbolWithMembers> symbol;
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
