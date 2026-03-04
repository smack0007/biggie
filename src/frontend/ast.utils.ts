import * as path from "node:path";
import { ImportDeclaration } from "./ast.ts";

export function getOrCalculateModuleAlias(importDeclaration: ImportDeclaration): string {
  return importDeclaration.alias?.value ??
    path.basename(
      importDeclaration.module.value,
      path.extname(importDeclaration.module.value),
    );
}
