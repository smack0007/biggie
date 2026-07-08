import { hasFlag as _hasFlag } from "./shims.ts";

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function hasFlag(flags: number, flag: number, message: string): void {
  if (!_hasFlag(flags, flag)) {
    throw new AssertionError(message);
  }
}

export function notNull<T>(value: T | null | undefined, message: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}
