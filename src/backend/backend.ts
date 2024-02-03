export interface BackendContext {
  buffer: string;
  indentLevel: number;
  indent: () => void;
  append: (value: string) => void;
  prepend: (value: string) => void;
  remove: (count: u64) => void;
}

export function createBackendContext(): BackendContext {
  return {
    buffer: "",

    indentLevel: 0,

    indent: function () {
      for (let i = 0; i < this.indentLevel; i++) {
        this.append("\t");
      }
    },

    append: function (value: string) {
      this.buffer += value;
    },

    prepend: function (value: string) {
      this.buffer = value + this.buffer;
    },

    remove: function (count: u64) {
      this.buffer = this.buffer.substring(0, this.buffer.length - count);
    },
  };
}
