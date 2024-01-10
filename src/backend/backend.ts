export interface BackendContext {
  append: (value: string) => void;
  prepend: (value: string) => void;
  remove: (count: u64) => void;
}
