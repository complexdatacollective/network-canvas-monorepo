import { RenderMarkdown } from "@codaco/fresco-ui/RenderMarkdown";
import Heading from "@codaco/fresco-ui/typography/Heading";
import { cx } from "@codaco/fresco-ui/utils/cva";
import type { SortOrder } from "@codaco/protocol-validation";
import { entityPrimaryKeyProperty, type NcNode } from "@codaco/shared-consts";
import { motion } from "motion/react";
import { memo, useRef } from "react";
import { useTrack } from "~/analytics/useTrack";
import NodeList from "~/components/NodeList";
import { usePrompts } from "~/components/Prompts/usePrompts";
import { useCurrentStep } from "~/contexts/CurrentStepContext";
import useMediaQuery from "~/hooks/useMediaQuery";
import useSortedNodeList from "~/hooks/useSortedNodeList";
import { updateNode } from "~/store/modules/session";
import { useAppDispatch } from "~/store/store";
import { getEntityAttributes } from "~/utils/networkEntities";
import type { OrdinalBinItem as OrdinalBinItemType } from "../useOrdinalBins";

type OrdinalBinItemProps = {
	bin: OrdinalBinItemType;
	index: number;
	activePromptVariable: string;
	stageId: string;
	promptId: string;
	sortOrder?: SortOrder;
	totalBins: number;
};

const itemVariants = {
	initial: { opacity: 0, y: "20%" },
	animate: {
		opacity: 1,
		y: 0,
		transition: { type: "spring" as const, stiffness: 500, damping: 30 },
	},
	exit: { opacity: 0, y: "20%", transition: { duration: 0.15 } },
};

const getPromptColorClass = (color: string | undefined) => {
	return cx(
		color === "ord-color-seq-1" && "[--prompt-color:var(--ord-1)]",
		color === "ord-color-seq-2" && "[--prompt-color:var(--ord-2)]",
		color === "ord-color-seq-3" && "[--prompt-color:var(--ord-3)]",
		color === "ord-color-seq-4" && "[--prompt-color:var(--ord-4)]",
		color === "ord-color-seq-5" && "[--prompt-color:var(--ord-5)]",
		color === "ord-color-seq-6" && "[--prompt-color:var(--ord-6)]",
		color === "ord-color-seq-7" && "[--prompt-color:var(--ord-7)]",
		color === "ord-color-seq-8" && "[--prompt-color:var(--ord-8)]",
		color === "ord-color-seq-9" && "[--prompt-color:var(--ord-9)]",
		color === "ord-color-seq-10" && "[--prompt-color:var(--ord-10)]",
		!color && "[--prompt-color:var(--ord-1)]",
	);
};

const OrdinalBinItem = memo((props: OrdinalBinItemProps) => {
	const { bin, index, activePromptVariable, stageId, promptId, sortOrder = [], totalBins } = props;

	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();
	const { prompt } = usePrompts();
	const isPortrait = useMediaQuery("(orientation: portrait)");
	const track = useTrack();
	const lastBinIndexRef = useRef<Map<string, number>>(new Map());

	const missingValue = typeof bin.value === "number" && bin.value < 0;
	const blendPercent = Math.round((1 / totalBins) * index * 100);
	const isFirst = index === 0;
	const isLast = index === totalBins - 1;

	const promptColorClass = getPromptColorClass((prompt as { color?: string }).color);

	const handleDrop = (metadata?: Record<string, unknown>) => {
		const meta = metadata as NcNode | undefined;
		if (!meta) return;

		if (getEntityAttributes(meta)[activePromptVariable] === bin.value) {
			return;
		}

		const nodeId = meta[entityPrimaryKeyProperty];
		const previousIndex = lastBinIndexRef.current.get(nodeId);
		if (previousIndex === undefined) {
			track("node_binned", { node_id: nodeId, node_type: meta.type, bin_index: index });
		} else if (previousIndex !== index) {
			track("node_rebinned", {
				node_id: nodeId,
				node_type: meta.type,
				from_bin_index: previousIndex,
				to_bin_index: index,
			});
		}
		lastBinIndexRef.current.set(nodeId, index);

		void dispatch(
			updateNode({
				nodeId,
				newAttributeData: { [activePromptVariable]: bin.value },
				currentStep,
			}),
		);
	};

	const sortedNodes = useSortedNodeList(bin.nodes, sortOrder);

	const listId = `ORDBIN_NODE_LIST_${stageId}_${promptId}_${index}`;

	const panelClasses = cx(
		"row-span-2 grid min-w-0 grid-rows-subgrid overflow-hidden shadow portrait:col-span-2 portrait:row-span-1 portrait:grid-cols-subgrid portrait:grid-rows-none",
		"bg-[color-mix(in_oklch,var(--surface-1)_var(--blend-percent),var(--background)_calc(100%-var(--blend-percent)))]",
		missingValue && "bg-[color-mix(in_oklch,var(--rich-black)_10%,var(--background)_90%)]",
		isFirst && "rounded-tl rounded-bl portrait:rounded-tr portrait:rounded-bl-none",
		isLast && "rounded-tr rounded-br portrait:rounded-tr-none portrait:rounded-bl",
	);

	const accentClasses = cx(
		"flex min-h-14 items-center justify-center px-2 text-center",
		promptColorClass,
		missingValue
			? "bg-[color-mix(in_oklab,var(--rich-black)_20%,var(--background)_80%)]"
			: "bg-[color-mix(in_oklab,var(--prompt-color)_var(--blend-percent),var(--background)_calc(100%-var(--blend-percent)))]",
	);

	const bodyClasses = cx(
		"flex min-h-0 flex-col items-center overflow-hidden transition-colors duration-200",
		promptColorClass,
	);

	return (
		<motion.div
			data-testid={`ordinal-bin-${index}`}
			className={panelClasses}
			variants={itemVariants}
			style={
				{
					"--blend-percent": `${100 - blendPercent}%`,
				} as React.CSSProperties
			}
		>
			<div className={accentClasses}>
				<Heading level="h4" variant="default" margin="none">
					<RenderMarkdown>{bin.label}</RenderMarkdown>
				</Heading>
			</div>
			<NodeList
				id={listId}
				items={sortedNodes}
				nodeSize="sm"
				orientation={isPortrait ? "horizontal" : "vertical"}
				className={bodyClasses}
				announcedName={`Container for the value '${bin.label}'`}
				onDrop={handleDrop}
				accepts={["NODE"]}
			/>
		</motion.div>
	);
});

OrdinalBinItem.displayName = "OrdinalBinItem";

export default OrdinalBinItem;
