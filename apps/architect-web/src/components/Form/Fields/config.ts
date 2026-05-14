export const ALLOWED_MARKDOWN_TAGS = [
	"br",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"ul",
	"ol",
	"li",
	"p",
	"strong",
	"hr",
] as const;

const _ALLOWED_MARKDOWN_PROMPT_TAGS = ["p", "em", "strong"] as const;

export const ALLOWED_MARKDOWN_LABEL_TAGS = ["br", "em", "strong", "ul", "ol", "li"] as const;

export const ALLOWED_MARKDOWN_INLINE_LABEL_TAGS = ["em", "strong"] as const;
