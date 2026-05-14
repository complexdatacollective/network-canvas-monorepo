import { useSlate } from "slate-react";
import { cx } from "~/utils/cva";
import Icon from "./Icon";
import { isBlockActive, isMarkActive, toggleBlock, toggleMark } from "./lib/actions";

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
		className={cx(
			"rounded-full bg-transparent border-0 outline-none cursor-pointer",
			"size-(--space-xl) m-(--space-xs)",
			"transition-[filter,background-color] duration-(--animation-duration-fast) ease-(--animation-easing)",
			"[&_svg]:align-middle [&_svg]:w-full",
			isActive ? "bg-primary" : "grayscale brightness-[0.65] hover:brightness-0",
		)}
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
