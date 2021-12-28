import libwabt from "wabt";

export interface WasmAssembly {
  main(): number;
}

export async function compileWat(
  wat: string,
  imports: WebAssembly.Imports = {}
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  const wabt = await libwabt();
  const parsed = wabt.parseWat("file.wat", wat);
  parsed.resolveNames();
  parsed.validate();
  const binaryOutput = parsed.toBinary({ log: true, write_debug_names: true });
  const buffer = binaryOutput.buffer;
  return WebAssembly.instantiate(buffer, imports);
}

export async function invokeWat(buffer: string, invoke: (assembly: WasmAssembly) => any): Promise<any> {
  const memory = new WebAssembly.Memory({ initial: 1 });

  const wasm = await compileWat(buffer, {
    js: {
      memory,
      println: (offset: number, length: number) => {
        const bytes = new Uint8Array(memory.buffer, offset, length);
        const string = new TextDecoder("utf-8").decode(bytes);
        console.info(string);
      },
    },
  });

  return invoke(wasm.instance.exports as unknown as WasmAssembly);
}