/* eslint-disable import/prefer-default-export */

import { type Descendant, type Editor, Element, Node, type NodeEntry, type Path, Transforms } from "slate";
import { getBlocks } from "./utils";

interface BlockNode extends Element {
	type: string;
	children: Descendant[];
}

const toggleBlock = (editor: Editor, block: NodeEntry<BlockNode>): void => {
	const [node, path] = block;
	const type = node.type;

	switch (type) {
		case "block_quote":
			// de-blockquote
			Transforms.unwrapNodes(editor, {
				at: path,
				match: (n) => Element.isElement(n) && n.type === "block_quote",
				mode: "all",
			});
			break;
		case "ul_list":
		case "ol_list":
			// Unwrap all list items
			Transforms.unwrapNodes(editor, {
				at: path,
				match: (n) => Element.isElement(n) && n.type === "list_item",
				mode: "all",
			});
			// Set top level element to a block quote
			Transforms.setNodes(editor, { type: "block_quote" }, { at: path });
			break;
		case "paragraph":
			Transforms.wrapNodes(editor, { type: "block_quote", children: [] }, { at: path });
			break;
		default:
	}
};

// Supports blockquotes containing paragraphs
// and converting list items into block quotes
export const toggleBlockquote = (editor: Editor): void => {
	const blocks = getBlocks(editor);

	blocks.forEach((block) => {
		toggleBlock(editor, block);
	});

	const reversedPaths = blocks.reduce((acc: Path[], [, path]: NodeEntry<BlockNode>) => {
		acc.unshift(path);
		return acc;
	}, []);

	// Merge adjacent block quotes
	reversedPaths.forEach((path, index) => {
		const nextPath = reversedPaths[index + 1];
		if (!nextPath) {
			return;
		}
		const next = Node.get(editor, nextPath) as BlockNode;
		const current = Node.get(editor, path) as BlockNode;
		if (current.type === "block_quote" && next.type === "block_quote") {
			Transforms.mergeNodes(editor, { at: path });
		}
	});
};
