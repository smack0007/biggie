import { uint32 } from "../shims.ts";

let nextSymbolId = 0;

export enum IDType {
  symbol = 1,
}

export function generateId(type: IDType): uint32 {
  nextSymbolId += 1;
  return nextSymbolId;
}
