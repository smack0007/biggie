import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import * as args from "./args.ts";
import * as cBackend from "./backend/cBackend.ts";
import * as ast from "./frontend/ast/mod.ts";
import * as binder from "./frontend/binder.ts";
import * as parser from "./frontend/parser.ts";
import * as scanner from "./frontend/scanner.ts";
import { int } from "./shims.ts";
import { dump } from "./utils.ts";

main(process.argv.slice(2)).then(process.exit);

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

  const entryFileName = path.resolve(parsedArgs.files[0]);
  const entryDirectory = path.dirname(entryFileName);

  const oldDirectory = process.cwd();
  process.chdir(entryDirectory);

  let program: ast.Program;

  try {
    program = await parser.parse(entryFileName, {
      enter: (name: string, fileName: string, token?: scanner.Token) =>
        parsedArgs.debug &&
        console.info(`/*${fileName} ${name} (${token?.pos.line}, ${token?.pos.column}) <${token?.text}> */`),
    });
  } catch (error) {
    const parseError = <parser.ParserError> error;
    console.error(
      `Error: (${parseError.pos.line}, ${parseError.pos.column}) ${parseError.fileName} [${
        parser.ParserErrorKind[parseError.kind]
      }] ${parseError.message}\n`,
    );

    return 1;
  }

  process.chdir(oldDirectory);

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
    binder.bind(program);
  } catch (error) {
    try {
      const bindError = <binder.BindError> error;
      console.error(
        `Error: (${bindError.pos.line}, ${bindError.pos.column}) ${bindError.fileName} [${
          binder.BindErrorKind[bindError.kind]
        }] ${bindError.message}`,
      );
    } catch {
      console.error(
        `Error: ${error}`,
      );
    }
    return 1;
  }

  const emitResult = cBackend.emit(program);

  const outputFileName = path.resolve(parsedArgs.output);
  const outputDirectory = path.dirname(outputFileName);

  if (!(await fs.stat(outputDirectory)).isDirectory()) {
    await fs.mkdir(outputDirectory);
  }

  await fs.writeFile(outputFileName, emitResult.code, "utf-8");

  // TODO: The output from this is almost impossible to read. Make a function
  // that will produce more readable output.
  await fs.writeFile(
    path.join(path.dirname(outputFileName), path.basename(outputFileName)) + ".ast",
    ast.toGraphviz(program),
    "utf-8",
  );

  return 0;
}
