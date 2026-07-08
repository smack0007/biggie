import { nameofSyntaxKind } from "./nameof.ts";
import { Program, SyntaxNode } from "./syntaxTree.ts";
import { walk } from "./walk.ts";

export function toGraphviz(program: Program): string {
  let graphviz = "digraph AST {\n";
  graphviz += "  rankdir=TB;\n";
  graphviz += '  node [shape=box, fontname="Courier New"];\n\n';

  const nodeIdMap = new Map<SyntaxNode, number>();
  let nodeIdCounter = 0;

  function getNodeId(node: SyntaxNode): number {
    if (!nodeIdMap.has(node)) {
      nodeIdMap.set(node, nodeIdCounter++);
    }
    return nodeIdMap.get(node)!;
  }

  walk(program, (node, parent) => {
    const nodeId = getNodeId(node);

    // Add node to graph
    let label = nameofSyntaxKind(node.kind);
    const edgeLabel = getEdgeLabel(node);
    if (edgeLabel) {
      label += `\\n${edgeLabel}`;
    }

    // Properly escape the label for Graphviz
    const escapedLabel = escapeLabel(label);
    graphviz += `  n${nodeId} [label="${escapedLabel}"];\n`;

    // Add edges to parent
    if (parent) {
      const parentId = getNodeId(parent);
      graphviz += `  n${parentId} -> n${nodeId};\n`;
    }

    return true;
  });

  graphviz += "}\n";
  return graphviz;
}

function escapeLabel(label: string): string {
  return label
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function getEdgeLabel(node: SyntaxNode): string {
  if (node.kind === 15) { // Identifier
    const identifier = node as import("./syntaxTree.ts").Identifier;
    return `value="${escapeLabel(identifier.value)}"`;
  } else if (node.kind === 18) { // IntegerLiteral
    const integerLiteral = node as import("./syntaxTree.ts").IntegerLiteral;
    return `value="${escapeLabel(integerLiteral.value)}"`;
  } else if (node.kind === 32) { // StringLiteral
    const stringLiteral = node as import("./syntaxTree.ts").StringLiteral;
    return `value="${escapeLabel(stringLiteral.value)}"`;
  } else if (node.kind === 4) { // BooleanLiteral
    const booleanLiteral = node as import("./syntaxTree.ts").BooleanLiteral;
    return `value="${booleanLiteral.value}"`;
  }
  return "";
}
