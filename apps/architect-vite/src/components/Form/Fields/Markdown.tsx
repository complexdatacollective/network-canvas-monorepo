import emoji from "emoji-dictionary";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { ALLOWED_MARKDOWN_TAGS } from "./config";
import { escapeAngleBracket } from "./parse";

interface MarkdownProps {
	allowedElements?: string[];
	label: string;
	className?: string;
	markdownRenderers?: Record<string, React.ComponentType<any>>;
}

const _emojiTextRenderer = ({ node, ...props }: any) => (
	<p>
		{props.children.map((child) => {
			if (typeof child === "string") {
				return child.replace(/:\w+:/gi, (name) => emoji.getUnicode(name));
			}
			return child;
		})}
	</p>
);

const externalLinkRenderer = ({ href, children }: { href: string; children: React.ReactNode }) => (
	<a href={href} target="_blank" rel="noopener noreferrer">
		{children}
	</a>
);

const defaultMarkdownRenderers = {
	// p: emojiTextRenderer,
	a: externalLinkRenderer,
};

const Markdown = ({
	label,
	className = "markdown",
	allowedElements = ALLOWED_MARKDOWN_TAGS,
	markdownRenderers = {},
}: MarkdownProps) => {
	const combinedRenderers = useMemo(
		() => ({
			...defaultMarkdownRenderers,
			...markdownRenderers,
		}),
		[markdownRenderers],
	);

	const rawText = useMemo(() => {
		if (!label) {
			return null;
		}

		return escapeAngleBracket(label);
	}, [label]);

	return (
		<ReactMarkdown
			allowedElements={allowedElements}
			components={combinedRenderers}
			rehypePlugins={[rehypeRaw, rehypeSanitize]}
			unwrapDisallowed
		>
			{rawText}
		</ReactMarkdown>
	);
};

export default memo(Markdown);
