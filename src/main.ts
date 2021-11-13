import * as fs from "fs";
import { lex, LexemeType } from "./lexer/lexer";

process.exit(main(process.argv.slice(2)));

function main(argv: string[]): i32 {
  const lexemes = lex(fs.readFileSync(argv[0], "utf8"));

  for (const lexeme of lexemes) {
    console.info(
      `Type: ${LexemeType[lexeme.type]}, Value: ${lexeme.value}, Line: ${lexeme.line}, Column: ${lexeme.column}`
    );
  }
  return 0;
}
