import useDialog from "@codaco/fresco-ui/dialogs/useDialog";
import Field from "@codaco/fresco-ui/form/Field/Field";
import InputField from "@codaco/fresco-ui/form/fields/InputField";
import UINode from "@codaco/fresco-ui/Node";
import type { Stage } from "@codaco/protocol-validation";
import { entityAttributesProperty, entityPrimaryKeyProperty, type NcNode } from "@codaco/shared-consts";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTrack } from "../../analytics/useTrack";
import NodeDrawer from "../../components/NodeDrawer";
import Prompts from "../../components/Prompts";
import { usePrompts } from "../../components/Prompts/usePrompts";
import { useCurrentStep } from "../../contexts/CurrentStepContext";
import useReadyForNextStage from "../../hooks/useReadyForNextStage";
import { useStageSelector } from "../../hooks/useStageSelector";
import { makeGetCodebookForNodeType } from "../../selectors/protocol";
import { getNodeColorSelector } from "../../selectors/session";
import { updateNode } from "../../store/modules/session";
import { useAppDispatch } from "../../store/store";
import type { StageProps } from "../../types";
import { getNodeLabelAttribute } from "../../utils/getNodeLabelAttribute";
import CategoricalBinItem from "./components/CategoricalBinItem";
import { useCategoricalBins } from "./useCategoricalBins";
import { useCircleLayout } from "./useCircleLayout";

type CategoricalBinStageProps = StageProps<"CategoricalBin">;

const CAT_COLOR_VARS = [
	"var(--cat-1)",
	"var(--cat-2)",
	"var(--cat-3)",
	"var(--cat-4)",
	"var(--cat-5)",
	"var(--cat-6)",
	"var(--cat-7)",
	"var(--cat-8)",
	"var(--cat-9)",
	"var(--cat-10)",
];

const binsContainerVariants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: {
			staggerChildren: 0.07,
			when: "beforeChildren" as const,
		},
	},
	exit: { opacity: 0, transition: { duration: 0.2 } },
};

const getCatColor = (index: number) => {
	if (index < 0) return null;
	return CAT_COLOR_VARS[index % CAT_COLOR_VARS.length]!;
};

type CategoricalBinPrompts = Extract<Stage, { type: "CategoricalBin" }>["prompts"][number];

const getNodeLabel = (node: NcNode, getCodebook: ReturnType<typeof makeGetCodebookForNodeType.resultFunc>): string => {
	const codebook = getCodebook(node.type);
	const attributes = node[entityAttributesProperty];
	const labelAttrId = getNodeLabelAttribute(codebook?.variables ?? {}, attributes);

	if (labelAttrId) {
		const value = attributes[labelAttrId];
		if (typeof value === "string" || typeof value === "number") {
			return String(value);
		}
	}

	return codebook?.name ?? "Node";
};

const CategoricalBin = (_props: CategoricalBinStageProps) => {
	const [expandedBinIndex, setExpandedBinIndex] = useState<number | null>(null);
	const track = useTrack();
	const previousExpandedRef = useRef<number | null>(null);

	useEffect(() => {
		const previous = previousExpandedRef.current;
		if (expandedBinIndex !== null && previous === null) {
			track("bin_expanded", { bin_index: expandedBinIndex });
		} else if (expandedBinIndex === null && previous !== null) {
			track("bin_collapsed", { bin_index: previous });
		} else if (expandedBinIndex !== null && previous !== null && expandedBinIndex !== previous) {
			track("bin_collapsed", { bin_index: previous });
			track("bin_expanded", { bin_index: expandedBinIndex });
		}
		previousExpandedRef.current = expandedBinIndex;
	}, [expandedBinIndex, track]);

	const lastBinIndexRef = useRef<Map<string, number>>(new Map());

	// Collapse expanded bin on document-level click or Escape press, so the wrapping
	// container doesn't need an interactive role.
	useEffect(() => {
		if (expandedBinIndex === null) return;
		const collapse = () => setExpandedBinIndex(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") collapse();
		};
		document.addEventListener("click", collapse);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("click", collapse);
			document.removeEventListener("keydown", onKey);
		};
	}, [expandedBinIndex]);

	const {
		prompt: { id, otherVariable, otherVariablePrompt, variable },
	} = usePrompts<CategoricalBinPrompts>();

	const { bins, uncategorisedNodes } = useCategoricalBins();

	const { updateReady } = useReadyForNextStage();

	useEffect(() => {
		updateReady(uncategorisedNodes.length === 0);
	}, [uncategorisedNodes.length, updateReady]);

	// Reset expanded bin when prompt changes
	useEffect(() => {
		setExpandedBinIndex(null);
	}, [id]);

	const hasExpanded = expandedBinIndex !== null;

	const circleCount = hasExpanded ? bins.length - 1 : bins.length;
	const { containerRef, cols, rows } = useCircleLayout({
		count: circleCount,
	});

	// Shrink the expanded panel as bin count grows so the remaining bins have room
	const panelFraction = Math.max(0.25, 0.5 - 0.04 * Math.max(0, bins.length - 4));

	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();
	const { openDialog } = useDialog();
	const nodeColor = useStageSelector(getNodeColorSelector);
	const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);

	const handleDropNode = async (node: NcNode, binIndex: number) => {
		const nodeId = node[entityPrimaryKeyProperty];
		const bin = bins[binIndex]!;
		const previousIndex = lastBinIndexRef.current.get(nodeId);
		if (previousIndex === undefined) {
			track("node_binned", { node_id: nodeId, node_type: node.type, bin_index: binIndex });
		} else if (previousIndex !== binIndex) {
			track("node_rebinned", {
				node_id: nodeId,
				node_type: node.type,
				from_bin_index: previousIndex,
				to_bin_index: binIndex,
			});
		}
		lastBinIndexRef.current.set(nodeId, binIndex);

		// If the node is being dropped into the 'other' bin, show a dialog to specify the value for the other variable
		if (bin.isOther && otherVariable) {
			const result = await openDialog({
				type: "form",
				title: "Specify other",
				children: (
					<div className="flex items-start gap-4">
						<div className="shrink-0">
							<UINode color={nodeColor} label={getNodeLabel(node, getCodebookForNodeType)} />
						</div>
						<Field
							label={otherVariablePrompt!}
							placeholder="Enter your response here..."
							component={InputField}
							name="otherVariable"
							required
							autoFocus
						/>
					</div>
				),
				intent: "default",
			});

			if (!result) return;

			await dispatch(
				updateNode({
					nodeId,
					newAttributeData: {
						[variable]: null,
						[otherVariable]: typeof result.otherVariable === "string" ? result.otherVariable : null,
					},
					currentStep,
				}),
			);

			return;
		}
		await dispatch(
			updateNode({
				nodeId,
				newAttributeData: {
					...(otherVariable ? { [otherVariable]: null } : {}),
					[variable]: bin.value,
				},
				currentStep,
			}),
		);
	};

	return (
		<div data-testid="categorical-bin-interface" className="interface overflow-hidden pb-0">
			<Prompts />
			<div className="flex w-full min-h-0 flex-1 flex-col items-center gap-2">
				<div className="catbin-outer min-h-0 w-full flex-1">
					<AnimatePresence mode="wait">
						<motion.div
							key={id}
							ref={containerRef}
							className="catbin-circles grid size-full content-center justify-center justify-items-center gap-4 data-expanded:content-start"
							data-expanded={hasExpanded || undefined}
							style={
								{
									"--catbin-panel-fraction": panelFraction,
									gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
								} as React.CSSProperties
							}
							variants={binsContainerVariants}
							initial="initial"
							animate="animate"
							exit="exit"
						>
							{bins.map((bin, index) => (
								<CategoricalBinItem
									key={index}
									label={bin.label}
									isExpanded={index === expandedBinIndex}
									onToggleExpand={() => setExpandedBinIndex(index)}
									catColor={getCatColor(index)}
									onDropNode={(node) => handleDropNode(node, index)}
									nodes={bin.nodes}
									rows={rows}
								/>
							))}
						</motion.div>
					</AnimatePresence>
				</div>
				<NodeDrawer nodes={uncategorisedNodes} itemType="NODE" />
			</div>
		</div>
	);
};

export default CategoricalBin;
