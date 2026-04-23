import { includes } from "es-toolkit/compat";
import type { Editor } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";
import { useSlate } from "slate-react";
import { cx } from "~/utils/cva";
import { isBlockActive, smartInsertThematicBreak } from "./lib/actions";
import { toggleBlockquote } from "./lib/blockquotes";
import { TOOLBAR_ITEMS } from "./lib/options";
import { BlockButton, MarkButton, ToolbarButton } from "./ToolbarButton";

type CustomEditor = Editor &
	ReactEditor &
	HistoryEditor & {
		disallowedTypes?: string[];
	};

const toolbarStyles = cx("bg-surface-1 text-surface-1-contrast", "order-1 flex w-full items-center gap-1 px-6 py-2");

const spacerStyles = cx("mx-2 h-5 w-px shrink-0 bg-current/20");

const Toolbar = () => {
	const editor = useSlate() as CustomEditor;
	const { disallowedTypes = [] } = editor;
	const filteredItems = TOOLBAR_ITEMS.filter((item) => !disallowedTypes.includes(item));

	return (
		<div className={toolbarStyles}>
			{includes(filteredItems, "bold") && <MarkButton format="bold" icon="bold" tooltip="Bold" />}
			{includes(filteredItems, "italic") && <MarkButton format="italic" icon="italic" tooltip="Italic" />}
			{includes(filteredItems, "headings") && (
				<>
					<div className={spacerStyles} />
					<BlockButton format="heading_one" icon="h1" tooltip="Heading One" />
					<BlockButton format="heading_two" icon="h2" tooltip="Heading Two" />
					<BlockButton format="heading_three" icon="h3" tooltip="Heading Three" />
					<BlockButton format="heading_four" icon="h4" tooltip="Heading Four" />
				</>
			)}
			{includes(filteredItems, "quote") && (
				<>
					<div className={spacerStyles} />
					<ToolbarButton
						icon="quote"
						tooltip="Quote"
						isActive={isBlockActive(editor, "block_quote")}
						action={() => toggleBlockquote(editor)}
					/>
				</>
			)}
			{includes(filteredItems, "lists") && (
				<>
					<div className={spacerStyles} />
					<BlockButton format="ol_list" icon="ol" tooltip="Numbered List" />
					<BlockButton format="ul_list" icon="ul" tooltip="Bulleted List" />
				</>
			)}
			{includes(filteredItems, "thematic_break") && (
				<>
					<div className={spacerStyles} />
					<ToolbarButton action={() => smartInsertThematicBreak(editor)} icon="hr" tooltip="Thematic Break" />
				</>
			)}
			{includes(filteredItems, "history") && (
				<>
					<div className={spacerStyles} />
					<ToolbarButton icon="undo" tooltip="Undo" action={editor.undo} />
					<ToolbarButton icon="redo" tooltip="Redo" action={editor.redo} />
				</>
			)}
		</div>
	);
};

export default Toolbar;
