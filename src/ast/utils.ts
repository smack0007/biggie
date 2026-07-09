import * as path from "node:path";
import * as assert from "../assert.ts";
import {
  Declaration,
  Expression,
  ImportDeclaration,
  PointerType,
  Program,
  Reference,
  SourceFile,
  Symbol,
  SymbolFlags,
  SyntaxNode,
} from "./syntaxTree.ts";
import { isProgram, isSourceFile, isStatement } from "./typeGuards.ts";
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

export function getModulePrefixByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}

export function getProgramFromNode(node: SyntaxNode): Program | undefined {
  if (isProgram(node)) {
    return node;
  }

  let parent = node.parent;
  while (parent && !isProgram(parent)) {
    parent = parent.parent;
  }

  return parent;
}

export function getQualifiedNameForSymbol(symbol: Symbol): string {
  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
}

export function getSourceFileFromNode(node: SyntaxNode): SourceFile | undefined {
  if (isSourceFile(node)) {
    return node;
  }

  let parent = node.parent;
  while (parent && !isSourceFile(parent)) {
    parent = parent.parent;
  }

  return parent;
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
  const FILE_NAME = "<source>";

  return makeProgram(
    FILE_NAME,
    {
      FILE_NAME: makeSourceFile(FILE_NAME, [makeFuncDeclaration(
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
