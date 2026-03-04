import { SourceFile } from "./ast/mod.ts";

export interface Program {
  entryFileName: string;
  sourceFiles: Record<string, SourceFile>;
}
