import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";
import { cx } from "~/utils/cva";

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
}: PreviewNodeProps) => (
	<div className={cx(onClick && !selected && "cursor-pointer")}>
		<Node label={label} selected={selected} color={color} shape={shape} onClick={!selected ? onClick : undefined} />
	</div>
);

export default PreviewNode;
