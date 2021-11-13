import * as fs from "fs";
import { lex, LexemeType } from "./lexer";
import { parse } from "./parser";

process.exit(main(process.argv.slice(2)));

function main(argv: string[]): i32 {
  const fileName = argv[0];

  const lexemes = lex(fs.readFileSync(fileName, "utf8"));

  for (const lexeme of lexemes) {
    console.info(
      `Type: ${LexemeType[lexeme.type]}, Value: ${lexeme.text}, Line: ${lexeme.line}, Column: ${lexeme.column}`
    );
  }

  const ast = parse(fileName, lexemes);

  if (ast.error != null) {
    console.error(ast.error);
  } else {
    console.info(ast.value);
  }

  return 0;
}
