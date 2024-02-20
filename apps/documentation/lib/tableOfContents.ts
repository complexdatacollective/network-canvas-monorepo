import { toString } from 'mdast-util-to-string';
import { remark } from 'remark';
import { Node } from 'unist';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import { convertToUrlText } from './helper_functions';

export type HeadingNode = {
  value: string;
  depth: number;
  data: {
    id: string;
  };
  children: HeadingNode[];
};

export function headingTree(): (node: Node, file: VFile) => void {
  return (node, file) => {
    file.data.headings = getHeadingsForTree(node);
  };
}

function getHeadingsForTree(root: Node): HeadingNode[] {
  const nodes = {};
  const output: HeadingNode[] = [];
  const indexMap = {};
  visit(root, 'heading', (node: HeadingNode) => {
    addID(node, nodes);
    transformNode(node, output, indexMap);
  });

  return output;
}

// Add an "id" attribute to the heading elements based on their content
function addID(node: HeadingNode, nodes: Record<string, number>): void {
  const id = node.children.map((c: HeadingNode) => c.value || '').join('');
  nodes[id] = (nodes[id] || 0) + 1;
  node.data = node.data || {
    id: convertToUrlText(`${id}${nodes[id] > 1 ? ` ${nodes[id] - 1}` : ''}`),
  };
}

function transformNode(
  node: HeadingNode,
  output: HeadingNode[],
  indexMap: Record<string, any>,
): void {
  const transformedNode: HeadingNode = {
    value: toString(node),
    depth: node.depth,
    data: node.data,
    children: [],
  };

  if (node.depth === 2) {
    output.push(transformedNode);
    indexMap[node.depth] = transformedNode;
  } else {
    const parent = indexMap[node.depth - 1];
    if (parent) {
      parent.children.push(transformedNode);
      indexMap[node.depth] = transformedNode;
    }
  }
}

export async function getHeadings(content: string): Promise<HeadingNode[]> {
  // Use remark to convert Markdown into HTML string
  const processedContent = await remark().use(headingTree).process(content);

  return processedContent.data.headings as HeadingNode[];
}
