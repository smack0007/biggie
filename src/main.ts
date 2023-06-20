import * as ts from "typescript";
import * as fs from "node:fs/promises";

interface OutputContext {
  sourceFile: ts.SourceFile;
  buffer: string;
}

async function main(args: string[]): Promise<number> {
  const sourceFile = ts.createSourceFile(
    args[0],
    await fs.readFile(args[0], "utf-8"),
    ts.ScriptTarget.ES2015,
    /*setParentNodes */ true
  );

  const context: OutputContext = {
    sourceFile,
    buffer: "",
  };

  outputSourceFile(context, sourceFile);

  await fs.writeFile(args[1], context.buffer, "utf-8");

  return 0;
}

function write(context: OutputContext, output: string): void {
  context.buffer += output;
}

function writeNodeDebugInfo(context: OutputContext, node: ts.Node, depth = 0) {
  const { line, character } = context.sourceFile.getLineAndCharacterOfPosition(
    node.getStart()
  );
  const nodeKind = ts.SyntaxKind[node.kind];
  const indent = "  ".repeat(depth);
  write(context, `// ${indent}(${line}, ${character}) ${nodeKind}\n`);
}

function outputSourceFile(context: OutputContext, sourceFile: ts.SourceFile) {
  for (const statement of sourceFile.statements) {
    outputStatement(context, statement);
  }
}

function outputStatement(context: OutputContext, statement: ts.Statement) {
  // writeNodeDebugInfo(context, statement);
  switch (statement.kind) {
    case ts.SyntaxKind.ImportDeclaration:
      outputImportDeclaration(context, statement as ts.ImportDeclaration);
      break;
  }
}

function outputImportDeclaration(
  context: OutputContext,
  importDeclaration: ts.ImportDeclaration
) {
  writeNodeDebugInfo(context, importDeclaration);
  // write(context, JSON.stringify(importDeclaration.importClause));
}

main(process.argv.slice(2)).then((code) => process.exit(code));
