import process from "node:process";
import { readFile } from "node:fs/promises";
import { emitC } from "./backend/cBackend.ts";
import { scan } from "./frontend/scanner.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { int, isError, isSuccess } from "./shims.ts";

main(process.argv.slice(2)).then(process.exit);

async function main(argv: string[]): Promise<int> {
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

  if (isSuccess(sourceFile)) {
    let buffer = "";

    emitC(sourceFile.value, {
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
      remove: function (count: int) {
        buffer = buffer.substring(0, buffer.length - count);
      },
    });

    console.info(buffer);
  } else if (isError(sourceFile)) {
    process.stderr.write(
      `Error: (${sourceFile.error.line}, ${sourceFile.error.column}) ${ParserErrorKind[sourceFile.error.kind]} ${
        sourceFile.error.message
      }\n`,
    );

    return 1;
  }

  return 0;
}
