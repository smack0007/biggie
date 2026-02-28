import { parseArgs } from "node:util";
import { bool, error, Result, success } from "./shims.ts";

export interface ParseResult {
  debug: bool;
  output: string;
  files: string[];
}

export enum ParseErrorKind {
  Unknown,
  UnkownOption,
  NoInputFiles,
}

export interface ParseError {
  kind: ParseErrorKind;
  message: string;
}

export function parse(argv: string[]): Result<ParseResult, ParseError> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        debug: {
          type: "boolean",
          default: false,
        },
        output: {
          type: "string",
          short: "o",
        },
      },
      allowPositionals: true,
    });

    if (positionals.length == 0) {
      return error({
        kind: ParseErrorKind.NoInputFiles,
        message: getErrorMessage(ParseErrorKind.NoInputFiles),
      });
    }

    return success({
      ...(values as Exclude<ParseResult, "files">),
      files: positionals,
    });
  } catch (err) {
    const kind = mapNodeErrorCode((err as { code: string }).code);
    return error({
      kind: kind,
      message: getErrorMessage(kind),
    });
  }
}

function mapNodeErrorCode(code: string): ParseErrorKind {
  switch (code) {
    case "ERR_PARSE_ARGS_UNKNOWN_OPTION":
      return ParseErrorKind.UnkownOption;
  }

  return ParseErrorKind.Unknown;
}

function getErrorMessage(kind: ParseErrorKind): string {
  switch (kind) {
    case ParseErrorKind.Unknown:
      return "An unknown error occured.";

    case ParseErrorKind.UnkownOption:
      return "Failed to parse command line args.";

    case ParseErrorKind.NoInputFiles:
      return "No input files provided.";
  }

  return "" as never;
}
