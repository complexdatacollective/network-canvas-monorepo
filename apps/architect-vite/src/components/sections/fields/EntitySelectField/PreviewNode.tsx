import Node, { type NodeColorSequence, type NodeShape } from "@codaco/fresco-ui/Node";
import type { ComponentProps } from "react";
import { cx } from "~/utils/cva";

type NodeSize = ComponentProps<typeof Node>["size"];

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
			color={color as NodeColorSequence}
			shape={shape}
			size={size}
			onClick={!selected ? onClick : undefined}
		/>
	);

	return <div className={cx(onClick && !selected && "cursor-pointer")}>{content}</div>;
};

export default PreviewNode;
