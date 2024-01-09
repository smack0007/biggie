import * as process from "node:process";
import { readFile } from "node:fs/promises";
import { SourceFile } from "./frontend/ast.ts";
import { outputCpp } from "./backend/clangBackend.ts";
//import { outputJS } from "./backend/jsBackend.ts";
import { scan, Token, TokenType } from "./frontend/scanner.ts";
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

  let sourceFile = parse(fileName, lexemes, {
    enter: (name: string) => {},
    // enter: (name: string, token: Token) =>
    //   console.info(`/* ${name} (${token.line}, ${token.column}) <${token.text}> */`),
  });

  if (sourceFile.error != null) {
    process.stderr.write(
      `Error: (${sourceFile.error.line}, ${sourceFile.error.column}) ${ParserErrorKind[sourceFile.error.kind]} ${
        sourceFile.error.message
      }`
    );
  } else {
    let buffer = "";

    outputCpp(lower(sourceFile.value!), {
      append: (value: string) => {
        buffer += value;
      },
      prepend: (value: string) => {
        buffer = value + buffer;
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
