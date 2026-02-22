import * as path from "node:path";
import * as ast from "./ast.ts";

export function getOrCalculateModuleAlias(importDeclaration: ast.ImportDeclaration): string {
  return importDeclaration.alias?.value ??
    path.basename(
      importDeclaration.module.value,
      path.extname(importDeclaration.module.value),
    );
}
