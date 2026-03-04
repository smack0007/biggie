import { uint } from "../shims.ts";
import { SourceFile } from "./ast/mod.ts";

export interface TextPosition {
  line: uint;
  column: uint;
}

export interface ProgramDiagnostic {
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
  sourceFiles: Record<string, SourceFile>;

  diagnostics: ProgramDiagnostic[];
}
