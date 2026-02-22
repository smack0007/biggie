export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export function firstLetterToLower(value: string): string {
  if (value.length == 0) {
    return value;
  }
  
  return value.charAt(0).toLowerCase() + value.substring(1);
}