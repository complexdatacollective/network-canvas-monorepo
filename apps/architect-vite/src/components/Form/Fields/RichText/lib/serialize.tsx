import { serialize } from "remark-slate";
import type { Descendant } from "slate";

interface TextNode {
	text: string;
	[key: string]: unknown;
}

interface ElementNode {
	children: (TextNode | ElementNode)[];
	[key: string]: unknown;
}

type SlateNode = TextNode | ElementNode;

// Escape any characters that could cause markdown to be generated
const escapeMarkdownChars = (string: string): string =>
	string
		.replace(/\\/g, "\\\\")
		.replace(/(^\d+)+(\.)/g, "$1\\$2")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/-/g, "\\-")
		.replace(/(\s*)#+(\s)/g, "$1\\#$2")
		.replace(/`/g, "\\`")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]");

const escapeNode = (node: SlateNode): SlateNode => {
	if ("children" in node && node.children) {
		return {
			...node,
			children: node.children.map((child: SlateNode) => escapeNode(child)),
		};
	}

	if ("text" in node && node.text) {
		return {
			...node,
			text: escapeMarkdownChars(node.text),
		};
	}

	return node;
};

const serializeNodes = (nodes: Descendant[]): string => nodes.map((n) => serialize(escapeNode(n))).join("\n");

export default serializeNodes;
