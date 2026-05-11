"use client";

import { entityAttributesProperty, entityPrimaryKeyProperty } from "@codaco/shared-consts";
import { get } from "es-toolkit/compat";
import { useCallback, useEffect, useRef } from "react";
import { useTrack } from "~/analytics/useTrack";
import Canvas from "~/canvas/Canvas";
import { createCanvasStore, useCanvasStore } from "~/canvas/useCanvasStore";
import ConcentricCircles from "~/components/ConcentricCircles";
import NodeDrawer from "~/components/NodeDrawer";
import { usePrompts } from "~/components/Prompts/usePrompts";
import { useCurrentStep } from "~/contexts/CurrentStepContext";
import { useAssetUrl } from "~/hooks/useAssetUrl";
import useSortedNodeList from "~/hooks/useSortedNodeList";
import { useStageSelector } from "~/hooks/useStageSelector";
import { getEdges, getPlacedNodes, getUnplacedNodes } from "~/selectors/canvas";
import { getNetworkNodesForType, getPromptSortOrder } from "~/selectors/session";
import { toggleEdge, toggleNodeAttributes, updateNode } from "~/store/modules/session";
import { useAppDispatch } from "~/store/store";
import type { StageProps } from "~/types";
import CollapsablePrompts from "./CollapsablePrompts";
import SimulationPanel from "./SimulationPanel";
import { useForceSimulation } from "./useForceSimulation";

type SociogramProps = StageProps<"Sociogram">;

const Sociogram = (stageProps: SociogramProps) => {
	const { stage } = stageProps;
	const { prompt } = usePrompts<(typeof stage.prompts)[number]>();
	const dispatch = useAppDispatch();

	const interfaceRef = useRef<HTMLDivElement>(null);

	// Behaviour Configuration
	const allowHighlighting = get(prompt, "highlight.allowHighlighting", false);
	const createEdge = get(prompt, "edges.create", null);
	const allowPositioning = get(prompt, "layout.allowPositioning", true);

	// Display Properties
	const layoutVariable = get(prompt, "layout.layoutVariable");
	const highlightAttribute = get(prompt, "highlight.variable");
	const layoutMode: "AUTOMATIC" | "MANUAL" = stage.behaviours?.automaticLayout?.enabled ? "AUTOMATIC" : "MANUAL";

	// Background Configuration
	const bgImageId = get(stage, "background.image", "") || undefined;
	const { url: backgroundImage } = useAssetUrl(bgImageId);
	const concentricCircles = get(stage, "background.concentricCircles");
	const skewedTowardCenter = get(stage, "background.skewedTowardCenter");

	const { currentStep } = useCurrentStep();
	const track = useTrack();
	const allNodes = useStageSelector(getNetworkNodesForType);
	const placedNodes = useStageSelector(getPlacedNodes);
	const unplacedNodes = useStageSelector(getUnplacedNodes);
	const sortOrder = useStageSelector(getPromptSortOrder);
	const sortedUnplacedNodes = useSortedNodeList(unplacedNodes, sortOrder);

	const canvasNodes = layoutMode === "AUTOMATIC" ? allNodes : placedNodes;
	const edges = useStageSelector(getEdges);

	// Zustand store for real-time positions
	const storeRef = useRef(createCanvasStore());
	const store = storeRef.current;

	// Sync positions from Redux when nodes or layout variable change.
	// In automatic mode, only initialize new nodes — the simulation owns positions.
	useEffect(() => {
		if (layoutMode === "AUTOMATIC") {
			store.getState().syncNewFromNodes(canvasNodes, layoutVariable);
		} else {
			store.getState().syncFromNodes(canvasNodes, layoutVariable);
		}
	}, [canvasNodes, layoutVariable, store, layoutMode]);

	// Force simulation (only active in AUTOMATIC mode)
	const simulation = useForceSimulation({
		enabled: layoutMode === "AUTOMATIC",
		nodes: canvasNodes,
		edges,
		layoutVariable,
		store,
		dispatch,
		currentStep,
	});

	const selectedNodeId = useCanvasStore(store, (state) => state.selectedNodeId);

	// Handle node selection (for edge creation and highlighting).
	// Reads selectedNodeId directly from the store to avoid closure staleness —
	// this callback is invoked from a DOM-level pointerup handler (useCanvasDrag)
	// which may capture an outdated closure between clicks.
	const handleNodeSelect = useCallback(
		(nodeId: string) => {
			if (createEdge) {
				const currentSelectedNodeId = store.getState().selectedNodeId;
				if (currentSelectedNodeId === null) {
					store.getState().selectNode(nodeId);
				} else if (currentSelectedNodeId === nodeId) {
					store.getState().selectNode(null);
				} else {
					void dispatch(
						toggleEdge({
							from: currentSelectedNodeId,
							to: nodeId,
							type: createEdge,
							currentStep,
						}),
					);
					store.getState().selectNode(null);
				}
			} else if (allowHighlighting && highlightAttribute) {
				const node = canvasNodes.find((n) => n[entityPrimaryKeyProperty] === nodeId);
				if (node) {
					const currentValue = node[entityAttributesProperty][highlightAttribute];
					track(currentValue ? "node_deselected" : "node_selected", { node_id: nodeId });
					dispatch(
						toggleNodeAttributes({
							nodeId,
							attributes: { [highlightAttribute]: !currentValue },
						}),
					);
				}
			}
		},
		[createEdge, store, dispatch, allowHighlighting, highlightAttribute, canvasNodes, track, currentStep],
	);

	// Handle drag end: sync single position to Redux
	const handleNodeDragEnd = useCallback(
		(nodeId: string, position: { x: number; y: number }) => {
			if (layoutMode === "MANUAL") {
				track("node_repositioned", { node_id: nodeId });
			}
			void dispatch(
				updateNode({
					nodeId,
					newAttributeData: {
						[layoutVariable]: { x: position.x, y: position.y },
					},
					currentStep,
				}),
			);
		},
		[dispatch, layoutVariable, currentStep, layoutMode, track],
	);

	// Handle drop from drawer to canvas (first placement of an unplaced node)
	const handleDrop = useCallback(
		(nodeId: string, position: { x: number; y: number }) => {
			if (layoutMode === "MANUAL") {
				track("node_initial_positioned", { node_id: nodeId });
			}
			store.getState().setPosition(nodeId, position);
			void dispatch(
				updateNode({
					nodeId,
					newAttributeData: {
						[layoutVariable]: { x: position.x, y: position.y },
					},
					currentStep,
				}),
			);
		},
		[store, dispatch, layoutVariable, currentStep, layoutMode, track],
	);

	const background = backgroundImage ? (
		<img src={backgroundImage} className="size-full object-cover" alt="Background" />
	) : (
		<ConcentricCircles n={concentricCircles} skewed={skewedTowardCenter} />
	);

	const simulationHandlers =
		layoutMode === "AUTOMATIC"
			? {
					moveNode: simulation.moveNode,
					releaseNode: simulation.releaseNode,
				}
			: null;

	return (
		<div
			className="interface h-dvh overflow-hidden"
			ref={interfaceRef}
			data-testid="sociogram"
			data-layout-mode={layoutMode}
			data-simulation-running={simulation.isRunning}
		>
			<Canvas
				background={background}
				nodes={canvasNodes}
				edges={edges}
				store={store}
				selectedNodeId={selectedNodeId}
				highlightAttribute={highlightAttribute}
				onNodeSelect={handleNodeSelect}
				onNodeDragEnd={handleNodeDragEnd}
				onDrop={handleDrop}
				allowRepositioning={allowPositioning}
				simulation={simulationHandlers}
			/>
			{layoutMode === "MANUAL" && <NodeDrawer nodes={sortedUnplacedNodes} floating />}
			<CollapsablePrompts dragConstraints={interfaceRef}>
				{layoutMode === "AUTOMATIC" && (
					<SimulationPanel simulationEnabled={simulation.simulationEnabled} onToggle={simulation.toggleSimulation} />
				)}
			</CollapsablePrompts>
		</div>
	);
};

export default Sociogram;
