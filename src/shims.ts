import * as os from "node:os";

export type bool = boolean;
export type char = string;
export type int32 = number;
export type int = int32;
export type uint32 = number;
export type uint = uint32;

export const EOL = os.EOL;

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) != 0;
}

// deno-lint-ignore ban-types
export function nameof(value: Function): string {
  return (value as unknown as { name: string }).name;
}
