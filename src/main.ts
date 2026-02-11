import { dirname, resolve } from "node:path";
import { argv, chdir, exit, stderr } from "node:process";
import { emitC } from "./backend/cBackend.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { int, isError, isSuccess } from "./shims.ts";
import { Token } from "./frontend/scanner.ts";

main(argv.slice(2)).then(exit);

async function main(argv: string[]): Promise<int> {
  const entryFileName = resolve(argv[0]);
  const entryDirectory = dirname(entryFileName);

  const debug = argv.includes("--debug");

  chdir(entryDirectory);
  const parseResult = await parse(entryFileName, {
    enter: (name: string, fileName: string, token?: Token) =>
      debug && console.info(`/*${fileName} ${name} (${token?.line}, ${token?.column}) <${token?.text}> */`),
  });

  if (isSuccess(parseResult)) {
    if (debug) {
      console.info("/* " + JSON.stringify(Object.keys(parseResult.value)) + " */");
    }

    const emitResult = emitC(parseResult.value, entryFileName);

    console.info(emitResult.code);
  } else if (isError(parseResult)) {
    stderr.write(
      `Error: (${parseResult.error.line}, ${parseResult.error.column}) ${ParserErrorKind[parseResult.error.kind]} ${
        parseResult.error.message
      }\n`,
    );

    return 1;
  }

  return 0;
}
