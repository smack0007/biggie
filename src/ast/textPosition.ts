import { uint } from "../shims.ts";

export interface TextPosition {
  line: uint;
  column: uint;
}

export function makeTextPosition(line: uint, column: uint): TextPosition {
  return { line, column };
}
