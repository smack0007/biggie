import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, chdir, cwd, exit, stderr } from "node:process";
import { emitC } from "./backend/cBackend.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { int, isSuccess } from "./shims.ts";
import { Token } from "./frontend/scanner.ts";
import { bind, BindError, BindErrorKind } from "./frontend/binder.ts";
import * as args from "./args.ts";

main(argv.slice(2)).then(exit);

async function main(argv: string[]): Promise<int> {
  let parsedArgs: args.ParseResult;

  try {
    parsedArgs = args.parse(argv);
  } catch (error) {
    const argsError = <args.ParseError> error;
    console.error(
      `Error: [${args.ParseErrorKind[argsError.kind]}] ${argsError.message}\n`,
    );
    return 1;
  }

  const entryFileName = resolve(parsedArgs.files[0]);
  const entryDirectory = dirname(entryFileName);

  const oldDirectory = cwd();
  chdir(entryDirectory);
  const parseResult = await parse(entryFileName, {
    enter: (name: string, fileName: string, token?: Token) =>
      parsedArgs.debug &&
      console.info(`/*${fileName} ${name} (${token?.pos.line}, ${token?.pos.column}) <${token?.text}> */`),
  });
  chdir(oldDirectory);

  if (isSuccess(parseResult)) {
    const program = parseResult.value;

    if (program.diagnostics.length > 0) {
      for (const diagnostic of program.diagnostics) {
        // TODO: Diagnostics could also be warnings.
        console.error(
          `Error: (${diagnostic.pos.line}, ${diagnostic.pos.column}) ${diagnostic.fileName} ${diagnostic.message}`,
        );
      }

      return 1;
    }

    try {
      bind(program);
    } catch (error) {
      const bindError = <BindError> error;
      console.error(
        `Error: (${bindError.pos.line}, ${bindError.pos.column}) ${bindError.fileName} [${
          BindErrorKind[bindError.kind]
        }] ${bindError.message}`,
      );
      return 1;
    }

    // console.info(`/* ${inspect(parseResult.value.sourceFiles[parseResult.value.entryFileName], { depth: 6 })} */`);

    const emitResult = emitC(program);

    const outputFileName = resolve(parsedArgs.output);
    const outputDirectory = dirname(outputFileName);

    if (!(await fs.stat(outputDirectory)).isDirectory()) {
      await fs.mkdir(outputDirectory);
    }

    await fs.writeFile(outputFileName, emitResult.code, "utf-8");
  } else {
    stderr.write(
      `Error: (${parseResult.error.pos.line}, ${parseResult.error.pos.column}) ${parseResult.error.fileName} [${
        ParserErrorKind[parseResult.error.kind]
      }] ${parseResult.error.message}\n`,
    );

    return 1;
  }

  return 0;
}
