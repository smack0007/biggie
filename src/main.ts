import * as fs from "fs";
import { SourceFile } from "./ast";
import { outputCLanguage } from "./cLanguageBackend";
import { lex } from "./lexer";
import { parse, ParserErrorKind } from "./parser";

process.exit(main(process.argv.slice(2)));

function main(argv: string[]): i32 {
  const fileName = argv[0];

  const lexemes = lex(fs.readFileSync(fileName, "utf8"));

  // for (const lexeme of lexemes) {
  //   console.info(
  //     `Type: ${LexemeType[lexeme.type]}, Value: ${lexeme.text}, Line: ${lexeme.line}, Column: ${lexeme.column}`
  //   );
  // }

  const sourceFile = parse(fileName, lexemes);

  if (sourceFile.error != null) {
    process.stderr.write(
      `Error: ${ParserErrorKind[sourceFile.error.kind]} at Line ${sourceFile.error.line} Column ${
        sourceFile.error.column
      }`
    );
  } else {
    outputCLanguage(<SourceFile>sourceFile.value, {
      output: process.stdout.write.bind(process.stdout),
    });
  }

  return 0;
}
