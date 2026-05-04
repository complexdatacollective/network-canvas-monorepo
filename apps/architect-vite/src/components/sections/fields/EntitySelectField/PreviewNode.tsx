import cx from "classnames";
import type { NodeShape, NodeSize } from "~/components/Node/Node";
import Node from "~/components/Node/Node";

type PreviewNodeProps = {
	label: string;
	color?: string;
	shape?: NodeShape;
	size?: NodeSize;
	onClick?: (() => void) | undefined;
	selected?: boolean;
};

const PreviewNode = ({
	label,
	color = "node-color-seq-1",
	shape = "circle",
	size = "md",
	onClick,
	selected = false,
}: PreviewNodeProps) => {
	const content = (
		<Node
			label={label}
			selected={selected}
			color={color}
			shape={shape}
			size={size}
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
