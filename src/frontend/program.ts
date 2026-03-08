import * as ast from "./ast/mod.ts";
import { uint } from "../shims.ts";

export interface TextPosition {
  line: uint;
  column: uint;
}

export interface Diagnostic {
  // The fileName of the source file the diagnositic is associated with.
  fileName: string;

  // The position in the source file.
  pos: TextPosition;

  // The message of the diagnostic.
  message: string;
}

export interface Program {
  // Path to the entry source file.
  entryFileName: string;

  // Map of [sourceFilePath] => SourceFile
  sourceFiles: Record<string, ast.SourceFile>;

  diagnostics: Diagnostic[];
}
