import { DeferStatement, ExpressionStatement, FuncDeclaration, ReturnStatement, SourceFile, Statement, StatementBlock, SyntaxKind } from "./ast.ts";

export function lower(sourceFile: SourceFile): SourceFile {
  return {
    ...sourceFile,
    statements: sourceFile.statements.map(lowerTopLevelStatement)
  };
}

function lowerTopLevelStatement(statement: Statement): Statement {
  switch (statement.kind) {
    case SyntaxKind.FuncDeclaration:
      return lowerFunctionDeclaration(<FuncDeclaration>statement);
  }
  
  return statement;
}

function lowerFunctionDeclaration(functionDeclaration: FuncDeclaration): FuncDeclaration {
  return {
    ...functionDeclaration,
    body: lowerStatementBlock(functionDeclaration.body)
  };
}

function lowerStatementBlock(statementBlock: StatementBlock): StatementBlock {
  const loweredStatementBlock: StatementBlock = {
    ...statementBlock,
    statements: [],
  };
  
  const deferedStatements: Array<DeferStatement> = [];
  for (const statement of statementBlock.statements) {
    if (statement.kind == SyntaxKind.DeferStatement) {
      deferedStatements.push(<DeferStatement>statement);
    } else {
      loweredStatementBlock.statements.push(statement);
    }
  }

  // Reinsert defered statements
  let returnStatement: ReturnStatement | null = null;
  if (loweredStatementBlock.statements[loweredStatementBlock.statements.length - 1].kind == SyntaxKind.ReturnStatement) {
    returnStatement = <ReturnStatement>loweredStatementBlock.statements.pop();
  }  

  for (let i = deferedStatements.length - 1; i >= 0; i -= 1) {
    loweredStatementBlock.statements.push(<ExpressionStatement>{
      kind: SyntaxKind.ExpressionStatement,
      expression: deferedStatements[i].expression
    });
  }

  if (returnStatement != null) {
    loweredStatementBlock.statements.push(returnStatement);
  }

  return loweredStatementBlock;
}

