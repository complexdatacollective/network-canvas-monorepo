import { visit } from 'unist-util-visit';

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  children?: Node[];
};

// Custom MDX components that render block-level markup. When authored inline in
// markdown (e.g. `<AppCompatibilityTable></AppCompatibilityTable>` on a single
// line), remark wraps them in a paragraph, producing invalid `<p><div></p>`
// nesting and a hydration error. This plugin lifts such a component out of its
// wrapping `<p>` so authoring style no longer matters.
const BLOCK_COMPONENTS = new Set([
  'appcompatibilitytable',
  'appswitch',
  'apponly',
  'responsivesvgpreview',
  'coordinateclassificationexample',
]);

const isMeaningful = (child: Node) =>
  child.type === 'element' ||
  (child.type === 'text' && (child.value ?? '').trim() !== '');

const unwrapBlockComponents = () => {
  return (tree: Node) => {
    visit(
      tree,
      { tagName: 'p' },
      (node: Node, index: number | undefined, parent: Node | undefined) => {
        if (!parent?.children || index === undefined || !node.children) {
          return;
        }

        const meaningful = node.children.filter(isMeaningful);
        const only = meaningful[0];

        if (
          meaningful.length === 1 &&
          only?.type === 'element' &&
          only.tagName !== undefined &&
          BLOCK_COMPONENTS.has(only.tagName)
        ) {
          parent.children.splice(index, 1, ...node.children);
          return index;
        }
      },
    );
  };
};

export default unwrapBlockComponents;
