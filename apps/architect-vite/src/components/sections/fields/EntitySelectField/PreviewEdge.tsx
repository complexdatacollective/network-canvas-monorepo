import cx from "classnames";
import { Icon } from "~/lib/legacy-ui/components";

type PreviewEdgeProps = {
	label: string;
	color: string;
	onClick?: (() => void) | null;
	selected?: boolean;
};

const PreviewEdge = ({ label, color, onClick = null, selected = false }: PreviewEdgeProps) => {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!selected && onClick && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<div
			className={cx("preview-edge", { "preview-edge--selected": selected }, { "preview-edge--clickable": onClick })}
			style={{ "--edge-color": `var(--${color})` }}
			onClick={!selected ? onClick : undefined}
			onKeyDown={handleKeyDown}
			role={onClick ? "button" : undefined}
			tabIndex={onClick && !selected ? 0 : -1}
			aria-label={`${selected ? "Selected" : "Select"} edge ${label}`}
		>
			<Icon name="links" color={color} />
			{label}
		</div>
	);
};

export default PreviewEdge;
