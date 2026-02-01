export type bool = boolean;
export type char = string;
export type int32 = number;
export type int = int32;

export type SucessResult<Value> = {
  readonly success: true;
  readonly value: Value;
};

export type ErrorResult<Error> = {
  readonly success: false;
  readonly error: Error;
};

export type Result<Value, Error> = SucessResult<Value> | ErrorResult<Error>;

export function success<Value>(value: Value): SucessResult<Value> {
  return { success: true, value };
}

export function error<Error>(error: Error): ErrorResult<Error> {
  return { success: false, error };
}

export function isSuccess<Value, Error>(result: Result<Value, Error>): result is SucessResult<Value> {
  return result.success;
}

export function isError<Value, Error>(result: Result<Value, Error>): result is ErrorResult<Error> {
  return !result.success;
}

export type OrNull<T> = T | null;

// deno-lint-ignore ban-types
export function nameof(value: Function): string {
  return (value as unknown as { name: string }).name;
}
