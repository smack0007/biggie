export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function notNull<T>(value: T | null | undefined, message: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}
