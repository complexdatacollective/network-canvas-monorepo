import cx from "classnames";
import { Node } from "~/lib/legacy-ui/components";

type PreviewNodeProps = {
	label: string;
	color?: string;
	onClick?: (() => void) | undefined;
	selected?: boolean;
};

const PreviewNode = ({ label, color = "node-color-seq-1", onClick, selected = false }: PreviewNodeProps) => (
	<div
		className={cx("preview-node", { "preview-node--selected": selected }, { "preview-node--clickable": onClick })}
		onClick={!selected ? onClick : undefined}
	>
		<Node label={label} selected={selected} color={color} />
	</div>
);


export default PreviewNode;
