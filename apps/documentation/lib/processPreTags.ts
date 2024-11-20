import { toString as hastNodeToString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

type Tree = {
	type: "root";
	children: Element[];
};

type Element = {
	type: "element";
	tagName: string;
	properties: Record<string, string>;
	children: Element[];
};

// Custom plugin to process `pre` tags
const processPreTags = () => {
	return (tree: Tree) => {
		visit(tree, { tagName: "pre" }, (node) => {
			const codeElement = node.children.find((child) => child.tagName === "code");
			if (!codeElement) {
				return;
			}

			// Extract the text content from the `code` element
			const rawCodeContent = hastNodeToString(codeElement);

			// Add the `raw` property with the extracted content to the `pre` element
			node.properties = { ...(node.properties || {}), raw: rawCodeContent };
		});
	};
};

export default processPreTags;
