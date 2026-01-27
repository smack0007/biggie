import * as process from "node:process";
import { readFile } from "node:fs/promises";
import { emitCpp } from "./backend/cppBackend.ts";
//import { outputJS } from "./backend/jsBackend.ts";
import { scan } from "./frontend/scanner.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { lower } from "./frontend/lowering.ts";

main(process.argv.slice(2)).then(process.exit);

async function main(argv: string[]): Promise<i32> {
  const fileName = argv[0];

  const lexemes = scan(await readFile(fileName, "utf8"));

  // for (const lexeme of lexemes) {
  //   console.info(
  //     `/* Type: ${TokenType[lexeme.type]}, Value: <${lexeme.text ?? ""}>, Line: ${lexeme.line}, Column: ${lexeme.column} */`
  //   );
  // }

  const sourceFile = parse(fileName, lexemes, {
    enter: (name: string) => {},
    // enter: (name: string, token: Token) =>
    //   console.info(`/* ${name} (${token.line}, ${token.column}) <${token.text}> */`),
  });

  if (sourceFile.error != null) {
    process.stderr.write(
      `Error: (${sourceFile.error.line}, ${sourceFile.error.column}) ${ParserErrorKind[sourceFile.error.kind]} ${
        sourceFile.error.message
      }\n`,
    );

    return 1;
  } else {
    let buffer = "";

    emitCpp(sourceFile.value!, {
      indentLevel: 0,
      append: function (value: string) {
        if (buffer.length == 0 || buffer[buffer.length - 1] == "\n") {
          for (let i = 0; i < this.indentLevel; i++) {
            buffer += "\t";
          }
        }
        buffer += value;
      },
      prepend: function (value: string) {
        buffer = value + buffer;
      },
      remove: function (count: u64) {
        buffer = buffer.substring(0, buffer.length - count);
      },
    });
    // outputWat(<SourceFile>sourceFile.value, {
    //   append: (value: string) => {
    //     buffer += value;
    //   },
    //   prepend: (value: string) => {
    //     buffer = value + buffer;
    //   },
    // });

    console.info(buffer);
  }

  return 0;
}
