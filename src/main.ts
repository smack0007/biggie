import * as fs from "fs";
import { SourceFile } from "./frontend/ast";
import { outputCLanguage } from "./backend/cLanguageBackend";
import { lex, LexemeType } from "./frontend/lexer";
import { parse, ParserErrorKind } from "./frontend/parser";

process.exit(main(process.argv.slice(2)));

function main(argv: string[]): i32 {
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
    outputCLanguage(<SourceFile>sourceFile.value, {
      output: process.stdout.write.bind(process.stdout),
    });
  }

  return 0;
}
