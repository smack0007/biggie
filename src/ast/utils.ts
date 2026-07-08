import * as path from "node:path";
import { ImportDeclaration, Symbol } from "./syntaxTree.ts";

export function getModulePrefixByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}

export function getQualifiedNameForSymbol(symbol: Symbol): string {
  let name = symbol.name;
  while (symbol.parent) {
    symbol = symbol.parent;
    name = symbol.name + "." + name;
  }
  return name;
}
