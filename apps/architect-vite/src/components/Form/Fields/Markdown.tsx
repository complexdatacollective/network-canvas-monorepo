import { type AnchorHTMLAttributes, type ClassAttributes, type ComponentType, memo, useMemo } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGemoji from "remark-gemoji";
import { ALLOWED_MARKDOWN_TAGS } from "./config";

/**
 * Hack for `>` characters that already exist in some protocols
 * and will be interpreted as block quotes on first load
 * Encoding this way forces slate to treat them as paragraphs.
 *
 * This function is also used by <Markdown> to sanitize incoming
 * strings.
 *
 * This was implemented as two successive 'replace' operations
 * rather than a single regex, because Safari does not support
 * lookbehind.
 */
const escapeAngleBracket = (value = "") => value.replace(/>/g, "&gt;").replace(/<br&gt;/g, "<br>");

const externalLinkRenderer = ({
	href,
	children,
}: ClassAttributes<HTMLAnchorElement> & AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) => (
	<a href={href} target="_blank" rel="noopener noreferrer">
		{children}
	</a>
);

const defaultMarkdownRenderers = {
	a: externalLinkRenderer,
};

type MarkdownProps = ComponentType<typeof ReactMarkdown> & {
	label: string;
	// Subset of ALLOWED_MARKDOWN_TAGS
	allowedElements?: typeof ALLOWED_MARKDOWN_TAGS;
	markdownRenderers?: Record<string, ComponentType<unknown>>;
	className?: string;
};

const Markdown = ({
	label,
	className = "markdown",
	allowedElements = ALLOWED_MARKDOWN_TAGS,
	markdownRenderers = {},
}: MarkdownProps) => {
	const rawText = useMemo(() => {
		if (!label) {
			return null;
		}

		return escapeAngleBracket(label);
	}, [label]);

	return (
		<span className={className} data-markdown>
			<ReactMarkdown
				allowedElements={allowedElements}
				components={{
					...defaultMarkdownRenderers,
					...markdownRenderers,
				}}
				remarkPlugins={[remarkGemoji]}
				rehypePlugins={[rehypeRaw, rehypeSanitize]}
				unwrapDisallowed
			>
				{rawText}
			</ReactMarkdown>
		</span>
	);
};

export default memo(Markdown, (prevProps, nextProps) => prevProps.label === nextProps.label);
