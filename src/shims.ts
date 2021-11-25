export type bool = boolean;
export type char = string;
export type i32 = number;
export type int = number;

export type Result<Value, Error> = {
  readonly value?: Value;
  readonly error?: Error;
};

export type OrNull<T> = T | null;
