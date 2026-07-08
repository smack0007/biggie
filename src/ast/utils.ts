import * as path from "node:path";
import * as assert from "../assert.ts";
import {
  BindFlags,
  Declaration,
  ImportDeclaration,
  Program,
  Reference,
  SourceFile,
  Symbol,
  SyntaxNode,
} from "./syntaxTree.ts";
import { isProgram, isSourceFile } from "./typeGuards.ts";
import { nameofBindFlags, nameofSyntaxKind } from "./nameof.ts";

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

export function getSymbol(node: Declaration | Reference, expectedFlags: BindFlags): Symbol {
  assert.notNull(node.symbol, `symbol is null in ${nameofSyntaxKind(node.kind)} node`);

  assert.hasFlag(
    node.symbol.flags,
    expectedFlags,
    `symbol did not have expected flag ${nameofBindFlags(expectedFlags)} in ${nameofSyntaxKind(node.kind)} node`,
  );

  return node.symbol;
}
