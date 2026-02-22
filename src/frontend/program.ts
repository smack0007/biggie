import { SourceFile } from "./ast.ts";

export interface Program {
  entryFileName: string;
  sourceFiles: Record<string, SourceFile>;
}
