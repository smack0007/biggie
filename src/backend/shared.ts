import * as ast from "../frontend/ast/mod.ts";
import { hasFlag } from "../shims.ts";

export enum BackendErrorKind {
  Unexpected = 0,
}

export interface BackendError extends ast.Diagnostic {
  kind: BackendErrorKind;
  message: string;
  fileName: string;
  pos: ast.TextPosition;
}

function getProgramFromNode(node: ast.SyntaxNode): ast.Program | undefined {
  if (ast.isProgram(node)) {
    return node;
  }

  let parent = node.parent;
  while (parent && !ast.isProgram(parent)) {
    parent = parent.parent;
  }
  return parent;
}

// TODO: Make this a shared function in the ast module.
function getSourceFileFromNode(node: ast.SyntaxNode): ast.SourceFile | undefined {
  if (ast.isSourceFile(node)) {
    return node;
  }

  let parent = node.parent;
  while (parent && !ast.isSourceFile(parent)) {
    parent = parent.parent;
  }
  return parent;
}

export function backendError(kind: BackendErrorKind, message: string, node: ast.SyntaxNode): BackendError {
  const sourceFile = getSourceFileFromNode(node);

  if (!sourceFile) {
    throw new Error();
  }

  return {
    kind,
    message,
    fileName: sourceFile.fileName,
    pos: node.startPos,
  };
}

export function getSymbol(node: ast.Declaration | ast.Reference, expectedFlags: ast.BindFlags): ast.Symbol {
  if (!node.symbol) {
    throw backendError(BackendErrorKind.Unexpected, `symbol is null in ${ast.SyntaxKind[node.kind]} node`, node);
  }
  if (!hasFlag(node.symbol.flags, expectedFlags)) {
    throw backendError(
      BackendErrorKind.Unexpected,
      `symbol did not have expected flag ${ast.BindFlags[expectedFlags]} in ${ast.SyntaxKind[node.kind]} node`,
      node,
    );
  }
  return node.symbol;
}
