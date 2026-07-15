import { makeOutputWriter, OutputWriter } from "../outputWriter.ts";
import { EOL } from "../shims.ts";
import {
  AdditiveExpression,
  ArrayLiteral,
  ArrayType,
  AssignmentExpression,
  BoolLiteral,
  CallExpression,
  ComparisonExpression,
  DeferStatement,
  ElementAccessExpression,
  EnumDeclaration,
  EnumMember,
  EqualityExpression,
  ExpressionStatement,
  FuncDeclaration,
  Identifier,
  IfStatement,
  ImportDeclaration,
  IntLiteral,
  LogicalExpression,
  MethodDeclaration,
  MethodReceiver,
  MultiplicativeExpression,
  Operator,
  ParenthesizedExpression,
  PointerType,
  Program,
  PropertyAccessExpression,
  QualifiedName,
  ReturnStatement,
  SourceFile,
  StatementBlock,
  StringLiteral,
  StructDeclaration,
  StructLiteral,
  StructLiteralElement,
  StructMember,
  SyntaxKind,
  SyntaxNode,
  TypeReference,
  UnaryExpression,
  VarDeclaration,
  WhileStatement,
} from "./syntaxTree.ts";

export interface ToStringOptions {
  newLine?: string;
}

export function toString(node: SyntaxNode, options: ToStringOptions = {}): string {
  const outputWriter = makeOutputWriter({
    newLine: options.newLine,
  });

  toStringInternal(outputWriter, node);

  return outputWriter.toString();
}

function toStringInternal(output: OutputWriter, node: SyntaxNode): void {
  switch (node.kind) {
    case SyntaxKind.AdditiveExpression: {
      const additiveExpression = <AdditiveExpression> node;
      toStringInternal(output, additiveExpression.lhs);
      output.append(" ");
      output.append(getOperatorSymbol(additiveExpression.operator));
      output.append(" ");
      toStringInternal(output, additiveExpression.rhs);
      break;
    }

    case SyntaxKind.ArrayLiteral: {
      const arrayLiteral = <ArrayLiteral> node;
      output.append("[");

      for (let i = 0; i < arrayLiteral.elements.length; i += 1) {
        if (i != 0) {
          output.append(",");
        }
        output.append(" ");
        toStringInternal(output, arrayLiteral.elements[i]);
        if (i == arrayLiteral.elements.length - 1) {
          output.append(" ");
        }
      }

      output.append("]");
      break;
    }

    case SyntaxKind.ArrayType: {
      const arrayType = <ArrayType> node;
      output.append("[]");
      toStringInternal(output, arrayType.elementType);
      break;
    }

    case SyntaxKind.AssignmentExpression: {
      const assignmentExpression = <AssignmentExpression> node;
      toStringInternal(output, assignmentExpression.name);
      output.append(" ");
      output.append(getOperatorSymbol(assignmentExpression.operator));
      output.append(" ");
      toStringInternal(output, assignmentExpression.value);
      break;
    }

    case SyntaxKind.BoolLiteral: {
      output.append((<BoolLiteral> node).value ? "true" : "false");
      break;
    }

    case SyntaxKind.CallExpression: {
      const callExpression = <CallExpression> node;
      toStringInternal(output, callExpression.expression);
      output.append("(");
      for (let i = 0; i < callExpression.args.length; i += 1) {
        if (i != 0) {
          output.append(", ");
        }
        toStringInternal(output, callExpression.args[i]);
      }
      output.append(")");
      break;
    }

    case SyntaxKind.ComparisonExpression: {
      const comparisonExpression = <ComparisonExpression> node;
      toStringInternal(output, comparisonExpression.lhs);
      output.append(" ");
      output.append(getOperatorSymbol(comparisonExpression.operator));
      output.append(" ");
      toStringInternal(output, comparisonExpression.rhs);
      break;
    }

    case SyntaxKind.DeferStatement: {
      const deferStatement = <DeferStatement> node;
      output.append("defer ");
      toStringInternal(output, deferStatement.body);
      break;
    }

    case SyntaxKind.ElementAccessExpression: {
      const elementAccessExpression = <ElementAccessExpression> node;
      toStringInternal(output, elementAccessExpression.expression);
      output.append("[");
      toStringInternal(output, elementAccessExpression.argumentExpression);
      output.append("]");
      break;
    }

    case SyntaxKind.EnumDeclaration: {
      const enumDeclaration = <EnumDeclaration> node;
      output.append("enum ");
      toStringInternal(output, enumDeclaration.name);
      output.appendLine(" {");
      output.indent();
      for (const enumMember of enumDeclaration.members) {
        toStringInternal(output, enumMember);
        output.appendLine(",");
      }
      output.unindent();
      output.appendLine("}");
      break;
    }

    case SyntaxKind.EnumMember: {
      const enumMember = <EnumMember> node;
      toStringInternal(output, enumMember.name);
      if (enumMember.initializer) {
        output.append(" = ");
        toStringInternal(output, enumMember.initializer);
      }
      break;
    }

    case SyntaxKind.EqualityExpression: {
      const equalityExpression = <EqualityExpression> node;
      toStringInternal(output, equalityExpression.lhs);
      output.append(" ");
      output.append(getOperatorSymbol(equalityExpression.operator));
      output.append(" ");
      toStringInternal(output, equalityExpression.rhs);
      break;
    }

    case SyntaxKind.ExpressionStatement: {
      const expressionStatement = <ExpressionStatement> node;
      toStringInternal(output, expressionStatement.expression);
      output.appendLine();
      break;
    }

    case SyntaxKind.FuncDeclaration: {
      const funcDeclaration = <FuncDeclaration> node;
      output.append("func ");
      toStringInternal(output, funcDeclaration.name);
      output.append("(");
      for (let i = 0; i < funcDeclaration.args.length; i += 1) {
        if (i != 0) {
          output.append(", ");
        }
        toStringInternal(output, funcDeclaration.args[i].name);
        output.append(": ");
        toStringInternal(output, funcDeclaration.args[i].declaredType);
        if (funcDeclaration.args[i].initializer) {
          output.append(" = ");
          // TODO: Get rid of !
          toStringInternal(output, funcDeclaration.args[i].initializer!);
        }
      }
      output.append("): ");
      toStringInternal(output, funcDeclaration.returnType);
      output.append(" ");
      toStringInternal(output, funcDeclaration.body);
      break;
    }

    case SyntaxKind.IfStatement: {
      const ifStatement = <IfStatement> node;
      output.append("if (");
      toStringInternal(output, ifStatement.condition);
      output.append(") ");
      toStringInternal(output, ifStatement.then);
      if (ifStatement.else) {
        output.append(" else ");
        toStringInternal(output, ifStatement.else);
      }
      break;
    }

    case SyntaxKind.ImportDeclaration: {
      const importDeclaration = <ImportDeclaration> node;
      output.append("import ");
      if (importDeclaration.alias) {
        toStringInternal(output, importDeclaration.alias);
        output.append(" ");
      }
      toStringInternal(output, importDeclaration.module);
      output.appendLine(";");
      break;
    }

    case SyntaxKind.Identifier: {
      output.append((<Identifier> node).value);
      break;
    }

    case SyntaxKind.IntLiteral: {
      output.append((<IntLiteral> node).value);
      break;
    }

    case SyntaxKind.LogicalExpression: {
      const logicalExpression = <LogicalExpression> node;
      toStringInternal(output, logicalExpression.lhs);
      output.append(" ");
      output.append(getOperatorSymbol(logicalExpression.operator));
      output.append(" ");
      toStringInternal(output, logicalExpression.rhs);
      break;
    }

    case SyntaxKind.MethodDeclaration: {
      const methodDeclaration = <MethodDeclaration> node;
      output.append("func ");
      toStringInternal(output, methodDeclaration.receiver);
      output.append(" ");
      toStringInternal(output, methodDeclaration.name);
      output.append("(");
      for (let i = 0; i < methodDeclaration.args.length; i += 1) {
        if (i != 0) {
          output.append(", ");
        }
        toStringInternal(output, methodDeclaration.args[i].name);
        output.append(": ");
        toStringInternal(output, methodDeclaration.args[i].declaredType);
        if (methodDeclaration.args[i].initializer) {
          output.append(" = ");
          // TODO: Get rid of !
          toStringInternal(output, methodDeclaration.args[i].initializer!);
        }
      }
      output.append("): ");
      toStringInternal(output, methodDeclaration.returnType);
      output.append(" ");
      toStringInternal(output, methodDeclaration.body);
      break;
    }

    case SyntaxKind.MethodReceiver: {
      const methodReceiver = <MethodReceiver> node;
      output.append("(");
      toStringInternal(output, methodReceiver.name);
      output.append(": ");
      toStringInternal(output, methodReceiver.declaredType);
      output.append(")");
      break;
    }

    case SyntaxKind.MultiplicativeExpression: {
      const multiplicativeExpression = <MultiplicativeExpression> node;
      toStringInternal(output, multiplicativeExpression.lhs);
      output.append(" ");
      output.append(getOperatorSymbol(multiplicativeExpression.operator));
      output.append(" ");
      toStringInternal(output, multiplicativeExpression.rhs);
      break;
    }

    case SyntaxKind.ParenthesizedExpression: {
      const parenthesizedExpression = <ParenthesizedExpression> node;
      output.append("(");
      toStringInternal(output, parenthesizedExpression.expression);
      output.append(")");
      break;
    }

    case SyntaxKind.PointerType: {
      const pointerType = <PointerType> node;
      output.append("*");
      toStringInternal(output, pointerType.elementType);
      break;
    }

    case SyntaxKind.PropertyAccessExpression: {
      const propertyAccessExpression = <PropertyAccessExpression> node;
      toStringInternal(output, propertyAccessExpression.expression);
      output.append(".");
      toStringInternal(output, propertyAccessExpression.name);
      break;
    }

    case SyntaxKind.Program: {
      const program = <Program> node;

      for (const [fileName, sourceFile] of Object.entries(program.sourceFiles)) {
        output.appendLine(`/* ${fileName} */`);
        toStringInternal(output, sourceFile);
        output.appendLine();
      }

      break;
    }

    case SyntaxKind.QualifiedName: {
      const qualifiedName = <QualifiedName> node;
      toStringInternal(output, qualifiedName.left);
      output.append(".");
      toStringInternal(output, qualifiedName.right);
      break;
    }

    case SyntaxKind.ReturnStatement: {
      const returnStatement = <ReturnStatement> node;
      output.append("return ");
      toStringInternal(output, returnStatement.expression);
      output.appendLine(";");
      break;
    }

    case SyntaxKind.SourceFile: {
      const sourceFile = <SourceFile> node;
      for (const statement of sourceFile.statements) {
        toStringInternal(output, statement);
      }
      break;
    }

    case SyntaxKind.StatementBlock: {
      const statementBlock = <StatementBlock> node;
      if (statementBlock.statements.length == 0) {
        output.appendLine("{}");
      } else {
        output.appendLine("{");
        output.indent();
        for (const statement of statementBlock.statements) {
          toStringInternal(output, statement);
        }
        output.unindent();
        output.appendLine("}");
      }
      break;
    }

    case SyntaxKind.StringLiteral: {
      output.append(`"`);
      output.append((<StringLiteral> node).value);
      output.append(`"`);
      break;
    }

    case SyntaxKind.StructDeclaration: {
      const structDeclaration = <StructDeclaration> node;
      output.append("struct ");
      toStringInternal(output, structDeclaration.name);
      output.appendLine(" {");
      for (let i = 0; i < structDeclaration.members.length; i += 1) {
        toStringInternal(output, structDeclaration.members[i]);
        output.appendLine(",");
      }
      output.appendLine("}");
      break;
    }

    case SyntaxKind.StructLiteral: {
      const structLiteral = <StructLiteral> node;
      if (structLiteral.elements.length == 0) {
        output.append("{}");
      } else {
        output.append("{");
        for (let i = 0; i < structLiteral.elements.length; i += 1) {
          if (i != 0) {
            output.append(", ");
          }
          toStringInternal(output, structLiteral.elements[i]);
        }
        output.append("}");
      }
      break;
    }

    case SyntaxKind.StructLiteralElement: {
      const structLiteralElement = <StructLiteralElement> node;
      if (structLiteralElement.name) {
        toStringInternal(output, structLiteralElement.name);
        output.append(": ");
      }
      toStringInternal(output, structLiteralElement.expression);
      break;
    }

    case SyntaxKind.StructMember: {
      const structMember = <StructMember> node;
      toStringInternal(output, structMember.name);
      output.append(": ");
      toStringInternal(output, structMember.declaredType);
      break;
    }

    case SyntaxKind.TypeReference: {
      const typeReference = <TypeReference> node;
      toStringInternal(output, typeReference.typeName);
      break;
    }

    case SyntaxKind.UnaryExpression: {
      const unaryExpression = <UnaryExpression> node;
      output.append(getOperatorSymbol(unaryExpression.operator));
      toStringInternal(output, unaryExpression.expression);
      break;
    }

    case SyntaxKind.VarDeclaration: {
      const varDeclaration = <VarDeclaration> node;
      output.append("var ");
      toStringInternal(output, varDeclaration.name);
      output.append(": ");
      toStringInternal(output, varDeclaration.declaredType);
      if (varDeclaration.initializer) {
        output.append(" = ");
        toStringInternal(output, varDeclaration.initializer);
      }
      output.appendLine(";");
      break;
    }

    case SyntaxKind.WhileStatement: {
      const whileStatement = <WhileStatement> node;
      output.append("while (");
      toStringInternal(output, whileStatement.condition);
      output.append(")");
      toStringInternal(output, whileStatement.body);
      break;
    }

    default:
      throw new Error(`Not implemented.`);
  }
}

function getOperatorSymbol(op: Operator): string {
  switch (op) {
    case Operator.Ampersand:
      return "&";
    case Operator.AmpersandAmpersand:
      return "&&";
    case Operator.Asterisk:
      return "*";
    case Operator.AsteriskEquals:
      return "*=";
    case Operator.BarBar:
      return "||";
    case Operator.Equals:
      return "=";
    case Operator.EqualsEquals:
      return "==";
    case Operator.Exclamation:
      return "!";
    case Operator.ExclamationEquals:
      return "!=";
    case Operator.GreaterThan:
      return ">";
    case Operator.GreaterThanEquals:
      return ">=";
    case Operator.LessThan:
      return "<";
    case Operator.LessThanEquals:
      return "<=";
    case Operator.Minus:
      return "-";
    case Operator.MinusEquals:
      return "-=";
    case Operator.Plus:
      return "+";
    case Operator.PlusEquals:
      return "+=";
    case Operator.Slash:
      return "/";
    case Operator.SlashEquals:
      return "/=";
    default:
      return Operator[op];
  }
}
