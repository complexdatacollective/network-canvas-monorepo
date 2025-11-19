import cx from "classnames";
import { Node } from "~/lib/legacy-ui/components";

type PreviewNodeProps = {
	label: string;
	color?: string;
	onClick?: (() => void) | undefined;
	selected?: boolean;
};

const PreviewNode = ({ label, color = "node-color-seq-1", onClick, selected = false }: PreviewNodeProps) => {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!selected && onClick && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<div
			className={cx("preview-node", { "preview-node--selected": selected }, { "preview-node--clickable": onClick })}
			onClick={!selected ? onClick : undefined}
			onKeyDown={handleKeyDown}
			role={onClick ? "button" : undefined}
			tabIndex={onClick && !selected ? 0 : -1}
			aria-label={`${selected ? "Selected" : "Select"} node ${label}`}
		>
			<Node label={label} selected={selected} color={color} />
		</div>
	);
};

export default PreviewNode;
