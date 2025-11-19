import { memo } from "react";
import { ALLOWED_MARKDOWN_INLINE_LABEL_TAGS, ALLOWED_MARKDOWN_LABEL_TAGS } from "./config";
import Markdown from "./Markdown";

interface MarkdownLabelProps {
	label: string;
	className?: string;
	inline?: boolean;
}

const MarkdownLabel = ({ label, className, inline = false }: MarkdownLabelProps) => (
	<Markdown
		className={className}
		allowedElements={inline ? ALLOWED_MARKDOWN_INLINE_LABEL_TAGS : ALLOWED_MARKDOWN_LABEL_TAGS}
		label={label}
	/>
);

export default memo(MarkdownLabel);
