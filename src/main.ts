import * as fs from "fs";
import { SourceFile } from "./frontend/ast";
import { outputC } from "./backend/cBackend";
import { lex, LexemeType } from "./frontend/lexer";
import { parse, ParserErrorKind } from "./frontend/parser";
import { outputWat } from "./backend/watBackend";

main(process.argv.slice(2)).then(process.exit);

async function main(argv: string[]): Promise<i32> {
  const fileName = argv[0];

  const lexemes = lex(fs.readFileSync(fileName, "utf8"));

  for (const lexeme of lexemes) {
    console.info(
      `Type: ${LexemeType[lexeme.type]}, Value: <${lexeme.text ?? ""}>, Line: ${lexeme.line}, Column: ${lexeme.column}`
    );
  }

  const sourceFile = parse(fileName, lexemes, {
    enter: (name: string) => console.info(name),
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
      output: (value: string) => {
        buffer += value;
      },
    });

    const wasm = await compileWat(buffer);
    console.info(wasm.instance.exports.main());
  }

  return 0;
}

async function compileWat(
  wat: string,
  imports: WebAssembly.Imports = {}
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  const wabt = await require("../ext/wabt/libwabt")();
  const parsed = wabt.parseWat("file.wat", wat);
  parsed.resolveNames();
  parsed.validate();
  const binaryOutput = parsed.toBinary({ log: true, write_debug_names: true });
  const buffer = binaryOutput.buffer;
  return WebAssembly.instantiate(buffer, imports);
}
