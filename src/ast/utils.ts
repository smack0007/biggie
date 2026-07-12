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
  Symbol,
  SymbolFlags,
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

export const SOURCE_FILE_NAME = "<source>";

export function getModulePrefixByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}

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

export function getQualifiedNameForSymbol(symbol: Symbol): string {
  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
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

export function makeProgramFromExpression(expression: Expression): Program {
  return makeProgram(
    SOURCE_FILE_NAME,
    {
      FILE_NAME: makeSourceFile(SOURCE_FILE_NAME, [makeFuncDeclaration(
        makeIdentifier("main"),
        [],
        makeTypeReference(makeIdentifier("void")),
        makeStatementBlock([
          makeExpressionStatement(expression),
        ]),
      )], {}),
    },
  );
}

export function makeProgramFromStatement(statement: Statement): Program {
  return makeProgram(
    SOURCE_FILE_NAME,
    {
      FILE_NAME: makeSourceFile(SOURCE_FILE_NAME, [makeFuncDeclaration(
        makeIdentifier("main"),
        [],
        makeTypeReference(makeIdentifier("void")),
        makeStatementBlock([
          statement,
        ]),
      )], {}),
    },
  );
}
