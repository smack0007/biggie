import * as process from "node:process";
import { readFile } from "node:fs/promises";
import { scan } from "./frontend/scanner.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { createBackendContext } from "./backend/backend.ts";
import { emitWat } from "./backend/watBackend.ts";

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
      }\n`
    );

    return 1;
  } else {
    const output = createBackendContext();

    emitWat(sourceFile.value!, output);

    console.info(output.buffer);
  }

  return 0;
}
