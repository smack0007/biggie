export interface BackendContext {
  output: (format: string, ...args: Array<any>) => void;
}
