import { readFile } from "fs/promises";
import { TextDecoder } from "util";
import libwabt from "wabt";
import { SourceFile } from "./frontend/ast";
import { outputC } from "./backend/cBackend";
import { scan, TokenType } from "./frontend/scanner";
import { parse, ParserErrorKind } from "./frontend/parser";
import { outputWat } from "./backend/watBackend";

main(process.argv.slice(2)).then(process.exit);

interface WasmAssembly {
  main(): number;
}

async function main(argv: string[]): Promise<i32> {
  const fileName = argv[0];

  const lexemes = scan(await readFile(fileName, "utf8"));

  // for (const lexeme of lexemes) {
  //   console.info(
  //     `Type: ${LexemeType[lexeme.type]}, Value: <${lexeme.text ?? ""}>, Line: ${lexeme.line}, Column: ${lexeme.column}`
  //   );
  // }

  const sourceFile = parse(fileName, lexemes, {
    enter: (name: string) => {},
    // enter: (name: string) => console.info(name),
  });

  if (sourceFile.error != null) {
    process.stderr.write(
      `Error: (${sourceFile.error.line}, ${sourceFile.error.column}) ${ParserErrorKind[sourceFile.error.kind]} ${
        sourceFile.error.message
      }`
    );
  } else {
    let buffer = "";

    // outputC(<SourceFile>sourceFile.value, {
    //   output: process.stdout.write.bind(process.stdout),
    // });
    outputWat(<SourceFile>sourceFile.value, {
      append: (value: string) => {
        buffer += value;
      },
      prepend: (value: string) => {
        buffer = value + buffer;
      },
    });

    console.info(buffer);

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

    console.info((wasm.instance.exports as unknown as WasmAssembly).main());
  }

  return 0;
}

async function compileWat(
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
