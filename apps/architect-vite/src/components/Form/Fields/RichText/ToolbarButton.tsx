import cx from "classnames";
import { useSlate } from "slate-react";
import Icon from "./Icon";
import { isBlockActive, isMarkActive, toggleBlock, toggleMark } from "./lib/actions";

interface ToolbarButtonProps {
	isActive?: boolean;
	icon: string;
	tooltip: string;
	action: () => void;
}

export const ToolbarButton = ({ isActive = false, icon, tooltip, action }: ToolbarButtonProps) => (
	<button
		title={tooltip}
		onMouseDown={(event) => {
			event.preventDefault();
			action();
		}}
		type="button"
		className={cx("rich-text__button", { "rich-text__button--is-active": isActive })}
	>
		<Icon name={icon} />
	</button>
);

interface BlockButtonProps {
	format: string;
	icon: string;
	tooltip?: string | null;
}

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

interface MarkButtonProps {
	format: string;
	icon: string;
	tooltip?: string | null;
}

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
