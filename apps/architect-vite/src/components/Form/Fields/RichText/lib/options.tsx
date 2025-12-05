const BLOCKS = ["headings", "lists", "thematic_break"];

const MARKS = ["bold", "italic"];

const HISTORY = ["history"];

// Internal use only - not exported
const _MODES = {
	full: "full",
	inline: "inline",
} as const;

export const ALWAYS_DISALLOWED = ["strike", "code"];

export const TOOLBAR_ITEMS = [...BLOCKS, ...MARKS, ...HISTORY];

export const INLINE_DISALLOWED_ITEMS = [...BLOCKS];

const LIST_TYPES = ["ol_list", "ul_list"];

const HEADING_TYPES = ["heading_one", "heading_two", "heading_three", "heading_four", "heading_five"];

export const BLOCK_TYPES = [...LIST_TYPES, ...HEADING_TYPES, "code_block"];
