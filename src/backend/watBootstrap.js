import * as fs from "node:fs/promises";

let memory;

const imports = {
  println: function (pointer, length) {
    const buffer = new Uint8Array(memory.buffer, pointer, length);
    console.log(new TextDecoder().decode(buffer));
  },
};

const wasmBuffer = await fs.readFile("./hello.wasm");
const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
  env: imports,
});
const wasmExports = wasmModule.instance.exports;

memory = wasmExports.memory;

process.exit(wasmExports.main());
