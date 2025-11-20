/* eslint-disable import/prefer-default-export */
import { Editor, type Node, type NodeEntry, Range, Transforms } from "slate";

export const getContainerBlockAtCursor = (editor: Editor): NodeEntry<Node> | undefined =>
	Editor.above(editor, {
		match: (n) => Editor.isBlock(editor, n),
		mode: "highest",
	});

export const getContainerBlocksAtSelection = (editor: Editor): NodeEntry<Node>[] => {
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

export const getBlocks = (editor: Editor): NodeEntry<Node>[] => {
	const { selection } = editor;
	const isCollapsed = selection && Range.isCollapsed(selection);

	if (isCollapsed) {
		const blockAtCursor = getContainerBlockAtCursor(editor);
		return blockAtCursor ? [blockAtCursor] : [];
	}

	return getContainerBlocksAtSelection(editor);
};

export const insertThematicBreak = (editor: Editor): void => {
	Transforms.insertNodes(editor, [
		{ type: "thematic_break", children: [{ text: "" }] },
		{ type: "paragraph", children: [{ text: "" }] },
	]);

	Transforms.move(editor, { unit: "line", distance: 1 });
};
