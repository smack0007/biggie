import { int } from "../shims.ts";

export interface BackendContext {
  indentLevel: int;
  append: (value: string) => void;
  prepend: (value: string) => void;
  remove: (count: int) => void;
}
