import * as path from "node:path";
import { ImportDeclaration } from "./syntaxTree.ts";

export function getModulePrefixByFileName(importDeclaration: ImportDeclaration): string {
  return path.basename(
    importDeclaration.module.value,
    path.extname(importDeclaration.module.value),
  );
}
