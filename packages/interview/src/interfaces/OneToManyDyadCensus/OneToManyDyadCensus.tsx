import type { ItemProps } from "@codaco/fresco-ui/collection/types";
import { entityPrimaryKeyProperty, type NcNode } from "@codaco/shared-consts";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTrack } from "~/analytics/useTrack";
import { ConnectedMotionNode } from "~/components/ConnectedNode";
import NodeList from "~/components/NodeList";
import Panel from "~/components/Panel";
import Prompts from "~/components/Prompts";
import { usePrompts } from "~/components/Prompts/usePrompts";
import { useCurrentStep } from "~/contexts/CurrentStepContext";
import useBeforeNext from "~/hooks/useBeforeNext";
import useSortedNodeList from "~/hooks/useSortedNodeList";
import { useStageSelector } from "~/hooks/useStageSelector";
import { getNetworkEdges, getNetworkNodesForType } from "~/selectors/session";
import { edgeExists, toggleEdge } from "~/store/modules/session";
import { useAppDispatch } from "~/store/store";
import type { StageProps } from "~/types";
import type { ProtocolSortRule } from "~/utils/createSorter";

type OneToManyDyadCensusProps = StageProps<"OneToManyDyadCensus">;

function OneToManyDyadCensus(props: OneToManyDyadCensusProps) {
	const {
		stage: {
			behaviours: { removeAfterConsideration },
		},
	} = props;

	const [currentStep, setCurrentStep] = useState(0);
	const { currentStep: stageStep } = useCurrentStep();

	// The ScrollArea viewport uses overflow-auto which clips nodes during
	// layoutId animations across the Surface boundary. Temporarily switch to
	// overflow-visible while the animation is in flight, then restore scrolling.
	const [isTransitioning, setIsTransitioning] = useState(false);

	const dispatch = useAppDispatch();

	const {
		prompt: { createEdge, bucketSortOrder, binSortOrder },
		promptIndex,
	} = usePrompts<{
		createEdge: string;
		bucketSortOrder?: ProtocolSortRule[];
		binSortOrder?: ProtocolSortRule[];
	}>();

	const nodes = useStageSelector(getNetworkNodesForType);
	const edges = useStageSelector(getNetworkEdges);

	const sortedSource = useSortedNodeList(nodes, bucketSortOrder);

	const source = sortedSource[currentStep]!;

	const track = useTrack();
	useEffect(() => {
		if (source) {
			track("focal_node", { node_id: source[entityPrimaryKeyProperty] });
		}
	}, [source, track]);

	const sortedTargets = useSortedNodeList(
		nodes.filter((node) => node[entityPrimaryKeyProperty] !== source[entityPrimaryKeyProperty]),
		binSortOrder,
	);

	// Takes into account removeAfterConsideration
	// There is one less step if we are removing the source node from the list
	const numberOfSteps = removeAfterConsideration ? sortedTargets.length - 1 : sortedTargets.length;

	/**
	 * Hijack stage navigation:
	 * - If we are moving forward and not on the last step, increment the step
	 * - If we are moving forward and on the last step, allow navigation
	 * - If we are moving backward, decrement the step until we reach 0
	 * - If we are moving backward and on step 0, allow navigation
	 */
	useBeforeNext((direction) => {
		if (direction === "forwards") {
			if (currentStep + 1 <= numberOfSteps) {
				setCurrentStep((prev) => prev + 1);
				setIsTransitioning(true);
				return false;
			}

			return true;
		}

		if (direction === "backwards") {
			if (currentStep > 0) {
				setCurrentStep((prev) => prev - 1);
				setIsTransitioning(true);
				return false;
			}

			return true;
		}

		return true;
	});

	// Reset the step when the prompt changes
	useEffect(() => {
		setCurrentStep(0);
		setIsTransitioning(true);
	}, [promptIndex]);

	// Fallback: restore overflow after animation duration in case
	// onLayoutAnimationComplete doesn't fire (e.g. no layout change).
	useEffect(() => {
		if (!isTransitioning) return;
		const timer = setTimeout(() => setIsTransitioning(false), 800);
		return () => clearTimeout(timer);
	}, [isTransitioning]);

	const handleNodeClick = useCallback(
		(sourceNode: NcNode, target: NcNode) => () => {
			const edgeAction = toggleEdge({
				from: sourceNode[entityPrimaryKeyProperty],
				to: target[entityPrimaryKeyProperty],
				type: createEdge,
				currentStep: stageStep,
			});

			void dispatch(edgeAction);
		},
		[createEdge, dispatch, stageStep],
	);

	const filteredTargets = useMemo(() => {
		if (!removeAfterConsideration) return sortedTargets;
		return sortedTargets.filter((node) => {
			const sortedIndex = sortedSource.findIndex((s) => s[entityPrimaryKeyProperty] === node[entityPrimaryKeyProperty]);
			return sortedIndex >= currentStep;
		});
	}, [sortedTargets, sortedSource, removeAfterConsideration, currentStep]);

	const renderItem = useCallback(
		(node: NcNode, itemProps: ItemProps) => {
			const selected = !!edgeExists(
				edges,
				node[entityPrimaryKeyProperty],
				source[entityPrimaryKeyProperty],
				createEdge,
			);
			return (
				<ConnectedMotionNode
					{...itemProps}
					nodeId={node[entityPrimaryKeyProperty]}
					type={node.type}
					size="sm"
					selected={selected}
					onClick={handleNodeClick(source, node)}
					layoutId={node[entityPrimaryKeyProperty]}
				/>
			);
		},
		[edges, source, createEdge, handleNodeClick],
	);

	return (
		<div className="interface">
			<Prompts />
			<AnimatePresence mode="popLayout">
				{source ? (
					<ConnectedMotionNode
						nodeId={source[entityPrimaryKeyProperty]}
						type={source.type}
						size="md"
						className="z-10"
						layoutId={source[entityPrimaryKeyProperty]}
						key={source[entityPrimaryKeyProperty]}
						onLayoutAnimationComplete={() => setIsTransitioning(false)}
					/>
				) : (
					<div key="missing" className="flex h-24 items-center justify-center">
						No nodes available to display.
					</div>
				)}
			</AnimatePresence>
			<Panel title="Select all that apply, then click next" panelNumber={0} noCollapse className="w-full max-w-7xl">
				<NodeList
					id="dyad-census-targets"
					items={filteredTargets}
					renderItem={renderItem}
					selectionMode="none"
					layoutGroupId={null}
					animationKey={promptIndex}
					aria-label="Target nodes"
					announcedName="Target nodes"
					emptyState={<h3>No nodes to display.</h3>}
				/>
			</Panel>
		</div>
	);
}

export default OneToManyDyadCensus;
