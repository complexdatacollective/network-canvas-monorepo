import { type DragMetadata, useDropTarget } from "@codaco/fresco-ui/dnd/dnd";
import { cx } from "@codaco/fresco-ui/utils/cva";
import type { NcNode } from "@codaco/shared-consts";
import { motion } from "motion/react";
import nodeBinUrl from "./node-bin.svg";

type NodeBinProps = {
	accepts: (node: NcNode) => boolean;
	dropHandler: (node: NcNode, metadata?: DragMetadata) => void;
};

const NodeBin = ({ accepts, dropHandler }: NodeBinProps) => {
	const { dropProps, isOver, willAccept } = useDropTarget({
		id: "node-bin",
		accepts: ["EXISTING_NODE", "FAMILY_TREE_NODE"],
		announcedName: "Delete bin",
		onDrop: (metadata) => {
			const node = metadata as NcNode;
			if (accepts(node)) {
				dropHandler(node, metadata);
			}
		},
	});

	return (
		<motion.div
			{...dropProps}
			className={cx(
				"pointer-events-auto absolute bottom-7 left-1/2 z-50",
				"h-28 w-20 -translate-x-1/2 overflow-hidden",
				"drop-shadow-[0_calc(2.4*var(--theme-root-size))_calc(2.4*var(--theme-root-size))_var(--nc-drop-shadow-color,rgba(0,0,0,0.3))]",
			)}
			initial={{ opacity: 0, y: "25%" }}
			animate={
				willAccept
					? {
							opacity: 1,
							y: 0,
							scale: isOver ? 2 : 1,
						}
					: { opacity: 0, y: "25%", scale: 1 }
			}
			transition={{ type: "spring", stiffness: 500, damping: 30 }}
		>
			{/*
			 * Background lives on a child rather than `style` on the motion.div
			 * because motion's `style` prop is reactive — passing a non-animated
			 * CSS property like `backgroundImage` alongside `initial`/`animate`
			 * doesn't reliably forward to the rendered element. A static child
			 * div sidesteps that interaction.
			 */}
			<div
				aria-hidden="true"
				className="size-full bg-contain bg-no-repeat"
				style={{ backgroundImage: `url(${nodeBinUrl})` }}
			/>
		</motion.div>
	);
};

export default NodeBin;
