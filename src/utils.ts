import { inspect } from "node:util";

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface DumpOptions {
  depth?: number;
}

export function dump(value: unknown, options: DumpOptions = {}): string {
  return inspect(value, {
    depth: options.depth ?? 3,
  });
}

export function firstLetterToLower(value: string): string {
  if (value.length == 0) {
    return value;
  }

  return value.charAt(0).toLowerCase() + value.substring(1);
}
