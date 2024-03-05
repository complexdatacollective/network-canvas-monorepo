import { toString } from 'mdast-util-to-string';
import type { Nodes, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { headingRank } from 'hast-util-heading-rank';

export type HeadingNode = {
  value: string;
  level: number;
  id: string;
  children: HeadingNode[];
};

export function headingTree(): (node: Root, file: VFile) => void {
  return (node, file) => {
    file.data.headings = getHeadingsForTree(node);
  };
}

type SpecialNodes = {
  properties: {
    id?: string;
  };
} & Nodes;

function getHeadingsForTree(root: Nodes): HeadingNode[] {
  const indexMap: HeadingNode[] = [];

  visit(root, 'element', (node: SpecialNodes) => {
    if (headingRank(node) && node.properties.id) {
      const level = headingRank(node)!;

      // If this is a level 2 heading, we want to start a new tree
      if (level === 2) {
        indexMap.push({
          value: toString(node),
          level,
          id: node.properties.id,
          children: [],
        });
      }

      // If level 3, add to the last level 2 headings children
      if (level === 3) {
        const lastLevel2 = indexMap[indexMap.length - 1];
        lastLevel2!.children.push({
          value: toString(node),
          level,
          id: node.properties.id,
          children: [],
        });
      }
    }
  });

  return indexMap;
}
