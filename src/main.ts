import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, chdir, cwd, exit, stderr } from "node:process";
import { emitC } from "./backend/cBackend.ts";
import { parse, ParserErrorKind } from "./frontend/parser.ts";
import { int, isError, isSuccess } from "./shims.ts";
import { Token } from "./frontend/scanner.ts";
import { bind, BindErrorKind } from "./frontend/binder.ts";
import * as args from "./args.ts";

main(argv.slice(2)).then(exit);

async function main(argv: string[]): Promise<int> {
  const argsResult = args.parse(argv);

  if (isError(argsResult)) {
    stderr.write(
      `Error: [${args.ParseErrorKind[argsResult.error.kind]}] ${argsResult.error.message}\n`,
    );

    return 1;
  }

  const entryFileName = resolve(argsResult.value.files[0]);
  const entryDirectory = dirname(entryFileName);

  const oldDirectory = cwd();
  chdir(entryDirectory);
  const parseResult = await parse(entryFileName, {
    enter: (name: string, fileName: string, token?: Token) =>
      argsResult.value.debug &&
      console.info(`/*${fileName} ${name} (${token?.pos.line}, ${token?.pos.column}) <${token?.text}> */`),
  });
  chdir(oldDirectory);

  if (isSuccess(parseResult)) {
    const program = parseResult.value;

    const bindResult = bind(program);

    if (isError(bindResult)) {
      stderr.write(
        `Error: (${bindResult.error.pos.line}, ${bindResult.error.pos.column}) [${
          BindErrorKind[bindResult.error.kind]
        }] ${bindResult.error.message}\n`,
      );

      return 1;
    }

    // console.info(`/* ${inspect(parseResult.value.sourceFiles[parseResult.value.entryFileName], { depth: 6 })} */`);

    const emitResult = emitC(program);

    const outputFileName = resolve(argsResult.value.output);
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
