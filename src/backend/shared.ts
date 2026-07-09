import * as ast from "../ast/mod.ts";

export enum BackendErrorKind {
  Unexpected = 0,
}

export interface BackendError extends ast.Diagnostic {
  kind: BackendErrorKind;
  message: string;
  fileName: string;
  pos: ast.TextPosition;
}

export function backendError(kind: BackendErrorKind, message: string, node: ast.SyntaxNode): BackendError {
  const sourceFile = ast.getSourceFileFromNode(node);

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
