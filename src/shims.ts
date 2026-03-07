export type bool = boolean;
export type char = string;
export type int32 = number;
export type int = int32;
export type uint32 = number;
export type uint = uint32;

//
// hasFlag
//

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) != 0;
}

//
// nameof
//

// deno-lint-ignore ban-types
export function nameof(value: Function): string {
  return (value as unknown as { name: string }).name;
}
