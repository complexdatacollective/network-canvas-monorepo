import { Icon } from "@codaco/legacy-ui/components";
import cx from "classnames";

type PreviewEdgeProps = {
	label: string;
	color: string;
	onClick?: (() => void) | null;
	selected?: boolean;
};

const PreviewEdge = ({ label, color, onClick = null, selected = false }: PreviewEdgeProps) => (
	<div
		className={cx("preview-edge", { "preview-edge--selected": selected }, { "preview-edge--clickable": onClick })}
		style={{ "--edge-color": `var(--${color})` }}
		onClick={!selected ? onClick : undefined}
	>
		<Icon name="links" color={color} />
		{label}
	</div>
);


export default PreviewEdge;
