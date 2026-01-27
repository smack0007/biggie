export type bool = boolean;
export type char = string;
export type int32 = number;
export type int = int32;

export type Result<Value, Error> =
  | {
      readonly value: Value;
      readonly error?: null;
    }
  | {
      readonly value?: null;
      readonly error: Error;
    };

export type OrNull<T> = T | null;

export function nameof(value: Function): string {
  return (value as unknown as { name: string }).name;
}
