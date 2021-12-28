import { readFile } from "fs/promises";
import { SourceFile } from "./frontend/ast";
import { outputC } from "./backend/clangBackend";
import { scan, TokenType } from "./frontend/scanner";
import { parse, ParserErrorKind } from "./frontend/parser";
import { outputWat } from "./backend/watBackend";

main(process.argv.slice(2)).then(process.exit);

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

    outputC(<SourceFile>sourceFile.value, {
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
