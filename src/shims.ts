export type char = string;
export type i32 = number;
export type int = number;

export type Either<Value, Error> = {
  value?: Value;
  error?: Error;
};
