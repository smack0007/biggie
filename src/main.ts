import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import * as args from "./args.ts";
import * as cpp from "./backend/cppBackend.ts";
import * as ast from "./ast/mod.ts";
import * as binder from "./frontend/binder.ts";
import * as parser from "./frontend/parser.ts";
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
      log: (message: string) =>
        parsedArgs.debug &&
        console.info(`/* ${message} */`),
    });
  } catch (error) {
    console.error(`Error: ${error}\n`);
    return 1;
  }

  process.chdir(oldDirectory);

  try {
    binder.bind(program);
  } catch (error) {
    console.error(`Error: ${error}\n`);
    return 1;
  }

  if (program.diagnostics.length > 0) {
    for (const diagnostic of program.diagnostics) {
      // TODO: Diagnostics could also be warnings.
      try {
        console.error(
          `Error: (${diagnostic.pos.line}, ${diagnostic.pos.column}) ${diagnostic.fileName} ${diagnostic.message}`,
        );
      } catch {
        // TODO: How do we get here?
        console.error(
          `Error: ${diagnostic}`,
        );
      }
    }

    return 1;
  }

  const emitResult = cpp.emit(program);

  const outputFileName = path.resolve(parsedArgs.output);
  const outputDirectory = path.dirname(outputFileName);

  if (!(await fs.stat(outputDirectory)).isDirectory()) {
    await fs.mkdir(outputDirectory);
  }

  await fs.writeFile(outputFileName, emitResult.code, "utf-8");

  // TODO: The output from this is almost impossible to read. Make a function
  // that will produce more readable output.
  // await fs.writeFile(
  //   path.join(path.dirname(outputFileName), path.basename(outputFileName)) + ".ast",
  //   ast.toGraphviz(program),
  //   "utf-8",
  // );

  return 0;
}
