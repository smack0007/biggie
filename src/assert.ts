import { bool, hasFlag as _hasFlag } from "./shims.ts";

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function fail(message: string): never {
  throw new AssertionError(message);
}

export function hasFlag(flags: number, flag: number, message: string): void {
  if (!_hasFlag(flags, flag)) {
    throw new AssertionError(message);
  }
}

export function areEqual<T>(value: unknown, expected: T, message: string): asserts value is T {
  if (value != expected) {
    throw new AssertionError(message);
  }
}

export function isTrue(expression: bool, message: string): asserts expression is true {
  if (!expression) {
    throw new AssertionError(message);
  }
}

export function notNull<T>(value: T | null | undefined, message: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}
