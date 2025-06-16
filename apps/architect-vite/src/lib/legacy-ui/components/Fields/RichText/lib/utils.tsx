/* eslint-disable import/prefer-default-export */
import { Editor, Range, Transforms, BaseEditor, NodeEntry, Node, Path } from "slate";

export const getContainerBlockAtCursor = (editor: BaseEditor): NodeEntry<Node> | undefined =>
  Editor.above(editor, {
    match: (n) => Editor.isBlock(editor, n),
    mode: "highest",
  });

export const getContainerBlocksAtSelection = (editor: BaseEditor): NodeEntry<Node>[] => {
  const nodes = Editor.nodes(editor);

  const blocks: NodeEntry<Node>[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const node of nodes) {
    // Top level nodes only
    if (node[1].length === 1) {
      blocks.push(node);
    }
  }

  return blocks;
};

export const getBlocks = (editor: BaseEditor): NodeEntry<Node>[] => {
  const { selection } = editor;
  const isCollapsed = selection && Range.isCollapsed(selection);

  if (isCollapsed) {
    const blockAtCursor = getContainerBlockAtCursor(editor);
    return blockAtCursor ? [blockAtCursor] : [];
  }

  return getContainerBlocksAtSelection(editor);
};

export const insertThematicBreak = (editor: BaseEditor): void => {
  Transforms.insertNodes(editor, [
    { type: "thematic_break", children: [{ text: "" }] },
    { type: "paragraph", children: [{ text: "" }] },
  ]);

  Transforms.move(editor, { unit: "line", distance: 1 });
};