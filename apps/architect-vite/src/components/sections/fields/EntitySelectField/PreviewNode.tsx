import cx from "classnames";
import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";

type PreviewNodeProps = {
	label: string;
	color?: string;
	shape?: NodeShape;
	onClick?: (() => void) | undefined;
	selected?: boolean;
};

const PreviewNode = ({
	label,
	color = "node-color-seq-1",
	shape = "circle",
	onClick,
	selected = false,
}: PreviewNodeProps) => {
	const content = (
		<Node
			label={label}
			selected={selected}
			color={color}
			shape={shape}
			size="sm"
			onClick={!selected ? onClick : undefined}
		/>
	);

	const commonClasses = cx(
		"preview-node",
		{ "preview-node--selected": selected },
		{ "preview-node--clickable": onClick },
	);

	return <div className={commonClasses}>{content}</div>;
};

export default PreviewNode;
