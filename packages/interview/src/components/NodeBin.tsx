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
							scale: isOver ? 1.5 : 1,
						}
					: { opacity: 0, y: "25%", scale: 1 }
			}
			transition={{ type: "spring", stiffness: 500, damping: 30 }}
		>
			{/*
			 * <img> rather than a child div with `background-image`: the latter
			 * worked historically but stops landing in the DOM when the parent
			 * is a motion.div — React passes the style prop, but the inline
			 * `style` attribute never reaches the rendered child. <img src> is
			 * unaffected.
			 */}
			<img src={nodeBinUrl} alt="" aria-hidden="true" className="size-full object-contain" />
		</motion.div>
	);
};

export default NodeBin;
