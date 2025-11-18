/* eslint-disable no-param-reassign,no-restricted-syntax */
import { type BaseEditor, Element, Node, type NodeEntry, Transforms } from "slate";

interface NormalizeEditor extends BaseEditor {
	inline?: boolean;
	normalizeNode: (entry: NodeEntry) => void;
}

/**
 * This extends the editor with a custom normalization
 * function to support 'single' line, and 'marks' only
 * modes.
 */
const withNormalize = (editor: NormalizeEditor): NormalizeEditor => {
	const { normalizeNode } = editor;

	editor.normalizeNode = ([node, path]: NodeEntry) => {
		/**
		 * 'inline' mode
		 *
		 * We can the top-level nodes, for each
		 * subsequent element after the first we
		 * merge it with the previous, creating
		 * an inline node.
		 */

		// for top level paths only
		if (editor.inline && path.length === 0) {
			// If empty, insert a blank paragraph node
			if (editor.children.length < 1) {
				const defaultNode = { type: "paragraph", children: [{ text: "" }] };
				Transforms.insertNodes(editor, defaultNode, { at: path.concat(0) });
			}

			// Force the first node to always be a paragraph and merge any
			// later nodes
			for (const [child, childPath] of Node.children(editor, path)) {
				if (Element.isElement(child) && childPath[0] === 0 && child.type !== "paragraph") {
					Transforms.setNodes(editor, { type: "paragraph", break: false }, { at: childPath });
				} else if (Element.isElement(child)) {
					Transforms.mergeNodes(editor, { at: childPath });
				}
			}
		}

		return normalizeNode([node, path]);
	};

	return editor;
};

export default withNormalize;
