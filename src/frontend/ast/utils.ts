import * as path from "node:path";
import { ImportDeclaration } from "./syntaxTree.ts";

export function getModuleAliasByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}

export function getOrCalculateModuleAlias(importDeclaration: ImportDeclaration): string {
  return importDeclaration.alias?.value ?? getModuleAliasByFileName(importDeclaration);
}
