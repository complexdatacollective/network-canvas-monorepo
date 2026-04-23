import { useSlate } from "slate-react";
import { cva, cx } from "~/utils/cva";
import Icon from "./Icon";
import { isBlockActive, isMarkActive, toggleBlock, toggleMark } from "./lib/actions";

const toolbarButtonVariants = cva({
	base: cx(
		"inline-flex items-center justify-center",
		"h-10 w-10 rounded-full p-2",
		"cursor-pointer border-0 bg-transparent outline-none",
		"transition-[filter,background-color] duration-150",
		"grayscale brightness-65 hover:grayscale hover:brightness-0",
		"focus-visible:focus-styles",
	),
	variants: {
		active: {
			true: "bg-primary grayscale-0 brightness-100 hover:grayscale-0 hover:brightness-100",
			false: "",
		},
	},
	defaultVariants: {
		active: false,
	},
});

type ToolbarButtonProps = {
	isActive?: boolean;
	icon: string;
	tooltip: string;
	action: () => void;
};

export const ToolbarButton = ({ isActive = false, icon, tooltip, action }: ToolbarButtonProps) => (
	<button
		title={tooltip}
		onMouseDown={(event) => {
			event.preventDefault();
			action();
		}}
		type="button"
		className={toolbarButtonVariants({ active: isActive })}
	>
		<Icon name={icon} />
	</button>
);

type BlockButtonProps = {
	format: string;
	icon: string;
	tooltip?: string | null;
};

export const BlockButton = ({ format, icon, tooltip = null }: BlockButtonProps) => {
	const editor = useSlate();
	return (
		<ToolbarButton
			isActive={isBlockActive(editor, format)}
			icon={icon}
			tooltip={tooltip || format}
			action={() => toggleBlock(editor, format)}
		/>
	);
};

type MarkButtonProps = {
	format: string;
	icon: string;
	tooltip?: string | null;
};

export const MarkButton = ({ format, icon, tooltip = null }: MarkButtonProps) => {
	const editor = useSlate();
	return (
		<ToolbarButton
			isActive={isMarkActive(editor, format)}
			icon={icon}
			tooltip={tooltip || format}
			action={() => toggleMark(editor, format)}
		/>
	);
};
