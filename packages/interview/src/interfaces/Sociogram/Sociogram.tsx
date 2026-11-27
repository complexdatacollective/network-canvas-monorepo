'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import type { DragMetadata } from '@codaco/fresco-ui/dnd/types';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import Node from '@codaco/fresco-ui/Node';
import { edgeTypeAllowsEndpoints } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { elapsedMs } from '../../analytics/elapsed';
import { useTrack } from '../../analytics/useTrack';
import Canvas from '../../canvas/Canvas';
import StageBackground from '../../canvas/StageBackground';
import { useAutoLayout } from '../../canvas/useAutoLayout';
import { createCanvasStore, useCanvasStore } from '../../canvas/useCanvasStore';
import NodeDrawer from '../../components/NodeDrawer';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { writeSucceeded } from '../../forms/writeSubmissionResult';
import { useNodeMeasurement } from '../../hooks/useNodeMeasurement';
import useNodeTypeSortedList from '../../hooks/useNodeTypeSortedList';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getEdges,
  getPlacedNodes,
  getUnplacedNodes,
} from '../../selectors/canvas';
import { getNetworkNodesForType } from '../../selectors/session';
import { useLoopingInteractionSound } from '../../sounds/InteractionSounds';
import type { AttributePatch } from '../../store/entityAttributePatch';
import { getCodebook } from '../../store/modules/protocol';
import {
  toggleEdge,
  toggleNodeAttributes,
  updateNode,
} from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import { useCachedOutcomes } from '../Anonymisation/useDecryptionScope';
import { useNodeLabeller } from '../Anonymisation/useNodeLabel';
import CollapsablePrompts from './CollapsablePrompts';
import SimulationPanel from './SimulationPanel';

type SociogramProps = StageProps<'Sociogram'>;

// DnD item type registered while dragging an already-placed node, so the
// unplaced-node drawer can accept it back.
const PLACED_NODE_ITEM_TYPE = 'PLACED_NODE';

export function unplaceNodeAttributePatch(layoutId: string): AttributePatch {
  return { set: {}, unset: [layoutId] };
}

const Sociogram = (stageProps: SociogramProps) => {
  const { stage } = stageProps;
  const { prompt } = usePrompts<(typeof stage.prompts)[number]>();
  const dispatch = useAppDispatch();
  const { announce } = useAccessibilityAnnouncements();

  const interfaceRef = useRef<HTMLDivElement>(null);

  // Each prompt is one task. Nodes are placed and moved only in a layout task;
  // a highlight task toggles the attribute named for each node's type, and a
  // connect task creates edges of one type.
  const isLayoutTask = prompt.task === 'layout';
  const createEdge = prompt.task === 'connect' ? prompt.edges.create : null;
  const highlightAttributes = useMemo(
    () =>
      prompt.task === 'highlight'
        ? Object.fromEntries(
            prompt.highlight.map(({ type, variable }) => [type, variable]),
          )
        : undefined,
    [prompt],
  );

  // Display Properties
  const layoutId = stage.layout;
  const layoutMode: 'AUTOMATIC' | 'MANUAL' = stage.behaviours?.automaticLayout
    ? 'AUTOMATIC'
    : 'MANUAL';

  // Background Configuration
  const stageBackground = stage.background;

  const { currentStep } = useCurrentStep();
  const track = useTrack();
  const allNodes = useStageSelector(getNetworkNodesForType);
  const placedNodes = useStageSelector(getPlacedNodes);
  const unplacedNodes = useStageSelector(getUnplacedNodes);
  const sortedUnplacedNodes = useNodeTypeSortedList(
    unplacedNodes,
    prompt.sortOrder,
    prompt.nodeTypeOrder,
    stage.subject.types,
  );

  const canvasNodes = layoutMode === 'AUTOMATIC' ? allNodes : placedNodes;
  const edges = useStageSelector(getEdges);

  // Zustand store for real-time positions
  const [store] = useState(() => createCanvasStore());

  // Measure the rendered node size off-screen so the layout's collision radius
  // tracks the live `--theme-root-size` scaling. A size="sm" Node matches the
  // on-canvas nodes; the returned measurementContainer is rendered INSIDE the
  // interface div below so it inherits --theme-root-size from the Shell.
  const { nodeWidth, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // Sync positions from Redux when the nodes or the stage's layout change.
  // In automatic mode, only initialize new nodes — the simulation owns positions.
  useEffect(() => {
    if (layoutMode === 'AUTOMATIC') {
      store.getState().syncNewFromNodes(canvasNodes, layoutId);
    } else {
      store.getState().syncFromNodes(canvasNodes, layoutId);
    }
  }, [canvasNodes, layoutId, store, layoutMode]);

  // Force simulation (only active in AUTOMATIC mode). Continuous, user-toggleable,
  // and persists settled positions back to Redux.
  const simulation = useAutoLayout({
    enabled: layoutMode === 'AUTOMATIC',
    nodes: canvasNodes,
    edges,
    store,
    nodeRadius: nodeWidth / 2,
    layoutId,
    groupVariable: '',
    persist: true,
    dispatch,
    currentStep,
    runMode: 'continuous',
    mockLayout: 'grid',
  });

  // Re-emit the legacy useForceSimulation analytics by observing isRunning
  // transitions: false->true is a run start, true->false is a settle.
  const wasRunningRef = useRef(false);
  const simStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    if (simulation.isRunning && !wasRunning) {
      simStartedAtRef.current = Date.now();
      track('simulation_started', {
        node_count: canvasNodes.length,
        edge_count: edges.length,
      });
    } else if (!simulation.isRunning && wasRunning) {
      track('simulation_finished', {
        duration_ms:
          simStartedAtRef.current !== null
            ? elapsedMs(simStartedAtRef.current)
            : 0,
        node_count: canvasNodes.length,
        edge_count: edges.length,
      });
      simStartedAtRef.current = null;
    }
    wasRunningRef.current = simulation.isRunning;
  }, [simulation.isRunning, canvasNodes.length, edges.length, track]);

  const selectedNodeId = useCanvasStore(store, (state) => state.selectedNodeId);
  const codebook = useSelector(getCodebook);

  // A source chosen for a connection belongs to the prompt it was chosen in.
  const promptId = prompt.id;
  const selectionPromptRef = useRef(promptId);
  useEffect(() => {
    if (selectionPromptRef.current === promptId) return;
    selectionPromptRef.current = promptId;
    store.getState().selectNode(null);
  }, [promptId, store]);

  // Outside a layout task, a node that has no position cannot be operated:
  // it stays in the drawer, dimmed, so the gap is evident. In a highlight task
  // so is a node whose type the prompt does not highlight, and in a connect
  // task a node the edge type cannot join to the selected source (or, before
  // a source is chosen, cannot start from).
  const isNodeDisabled = useCallback(
    (node: NcNode) => {
      if (isLayoutTask) return false;
      if (
        layoutMode === 'MANUAL' &&
        node[entityAttributesProperty][layoutId] == null
      ) {
        return true;
      }
      if (highlightAttributes !== undefined) {
        return !Object.hasOwn(highlightAttributes, node.type);
      }
      if (createEdge === null) return false;
      const sourceId = selectedNodeId;
      const source =
        sourceId === null
          ? undefined
          : allNodes.find((n) => n[entityPrimaryKeyProperty] === sourceId);
      if (source === undefined) {
        // A source needs a target it can tap: another node on the canvas.
        return !canvasNodes.some(
          (target) =>
            target[entityPrimaryKeyProperty] !==
              node[entityPrimaryKeyProperty] &&
            edgeTypeAllowsEndpoints(
              codebook,
              createEdge,
              node.type,
              target.type,
            ),
        );
      }
      if (source[entityPrimaryKeyProperty] === node[entityPrimaryKeyProperty]) {
        return false;
      }
      return !edgeTypeAllowsEndpoints(
        codebook,
        createEdge,
        source.type,
        node.type,
      );
    },
    [
      isLayoutTask,
      layoutMode,
      layoutId,
      highlightAttributes,
      createEdge,
      selectedNodeId,
      allNodes,
      canvasNodes,
      codebook,
    ],
  );

  // While a node waits to be connected to the next one tapped, a sound loops.
  // It stops with the selection, and with this prompt when the next one does
  // not connect nodes.
  useLoopingInteractionSound(
    'node-linking-mode',
    createEdge !== null && selectedNodeId !== null,
  );

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
      } else if (highlightAttributes !== undefined) {
        const node = canvasNodes.find(
          (n) => n[entityPrimaryKeyProperty] === nodeId,
        );
        const highlightAttribute =
          node === undefined ? undefined : highlightAttributes[node.type];
        if (node && highlightAttribute !== undefined) {
          const currentValue =
            node[entityAttributesProperty][highlightAttribute];
          track(currentValue ? 'node_deselected' : 'node_selected', {
            node_id: nodeId,
          });
          void dispatch(
            toggleNodeAttributes({
              nodeId,
              attributePatch: {
                set: { [highlightAttribute]: !currentValue },
                unset: [],
              },
            }),
          );
        }
      }
    },
    [
      createEdge,
      store,
      dispatch,
      highlightAttributes,
      canvasNodes,
      track,
      currentStep,
    ],
  );

  // Picking a node up and putting it down on the canvas, or in the drawer, are
  // heard through the drag and drop layer (see InteractionSoundsProvider),
  // once each handler below resolves that its position was stored: a
  // keyboard nudge moves the node a small step without a drag, and the
  // layout's own moves are not the participant's, so neither is heard. The
  // position itself is an ordinary update, which makes no sound of its own.

  // Handle drag end: sync single position to Redux
  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (layoutMode === 'MANUAL') {
        track('node_repositioned', { node_id: nodeId });
      }
      return dispatch(
        updateNode({
          nodeId,
          attributePatch: {
            set: {
              [layoutId]: { x: position.x, y: position.y },
            },
            unset: [],
          },
          currentStep,
        }),
      ).then(writeSucceeded);
    },
    [dispatch, layoutId, currentStep, layoutMode, track],
  );

  // Handle drop from drawer to canvas (first placement of an unplaced node)
  const handleDrop = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (layoutMode === 'MANUAL') {
        track('node_initial_positioned', { node_id: nodeId });
      }
      store.getState().setPosition(nodeId, position);
      return dispatch(
        updateNode({
          nodeId,
          attributePatch: {
            set: {
              [layoutId]: { x: position.x, y: position.y },
            },
            unset: [],
          },
          currentStep,
        }),
      ).then(writeSucceeded);
    },
    [store, dispatch, layoutId, currentStep, layoutMode, track],
  );

  // Reads each label as its node shows it when the node is unplaced: the
  // decrypted name once it is readable, never anything derived from it
  // otherwise.
  const labelNode = useNodeLabeller(useCachedOutcomes());

  // Unplace a node: clearing its position in the layout returns it to the drawer.
  // Reached by dragging a placed node onto the drawer, or by pressing
  // Delete/Backspace on a focused node.
  const handleUnplaceNode = useCallback(
    (nodeId: string) => {
      const node = allNodes.find((n) => n[entityPrimaryKeyProperty] === nodeId);
      const name = node ? labelNode(node) : null;

      track('node_unplaced', { node_id: nodeId });
      const stored = dispatch(
        updateNode({
          nodeId,
          attributePatch: unplaceNodeAttributePatch(layoutId),
          currentStep,
        }),
      ).then(writeSucceeded);
      announce(
        name ? `${name} returned to the drawer.` : 'Returned to the drawer.',
      );
      return stored;
    },
    [allNodes, labelNode, dispatch, layoutId, currentStep, track, announce],
  );

  const drawerDropTarget = useMemo(
    () => ({
      accepts: [PLACED_NODE_ITEM_TYPE],
      announcedName: 'Drawer',
      // Back in the drawer, the person is no longer placed.
      dropSound: 'toggle-off' as const,
      onDrop: (metadata?: DragMetadata) => {
        const nodeId = metadata?.nodeId;
        return typeof nodeId === 'string' && handleUnplaceNode(nodeId);
      },
    }),
    [handleUnplaceNode],
  );

  const simulationHandlers =
    layoutMode === 'AUTOMATIC'
      ? {
          moveNode: simulation.moveNode,
          releaseNode: simulation.releaseNode,
        }
      : null;

  return (
    <div
      className="interface h-full overflow-hidden"
      ref={interfaceRef}
      data-testid="sociogram"
      data-layout-mode={layoutMode}
      data-simulation-running={simulation.isRunning}
    >
      {measurementContainer}
      <Canvas
        backgroundClassName={
          stageBackground.image === undefined
            ? undefined
            : 'phone-landscape:-inset-4 tablet-landscape:-inset-6 desktop:-inset-x-8 -inset-2'
        }
        background={
          stageBackground.image === undefined ? (
            <StageBackground
              background={stageBackground}
              className="h-full"
              data-testid="sociogram-concentric-background"
            />
          ) : (
            <StageBackground background={stageBackground} />
          )
        }
        nodes={canvasNodes}
        edges={edges}
        store={store}
        selectedNodeId={createEdge === null ? null : selectedNodeId}
        highlightAttributes={highlightAttributes}
        isNodeDisabled={isNodeDisabled}
        onNodeSelect={handleNodeSelect}
        // Mirrors handleNodeSelect's own branching, so what is announced as a
        // toggle is exactly what activation operates on.
        nodeToggle={
          createEdge
            ? 'edge'
            : highlightAttributes !== undefined
              ? 'highlight'
              : null
        }
        onNodeDragEnd={handleNodeDragEnd}
        onDrop={handleDrop}
        allowDrop={isLayoutTask}
        allowRepositioning={isLayoutTask}
        simulation={simulationHandlers}
        nodeDragItemType={
          layoutMode === 'MANUAL' && isLayoutTask
            ? PLACED_NODE_ITEM_TYPE
            : undefined
        }
        onNodeRemove={
          layoutMode === 'MANUAL' && isLayoutTask ? handleUnplaceNode : null
        }
      />
      {layoutMode === 'MANUAL' && (
        <NodeDrawer
          nodes={sortedUnplacedNodes}
          floating
          dropTarget={isLayoutTask ? drawerDropTarget : undefined}
          isNodeDisabled={isLayoutTask ? undefined : isNodeDisabled}
        />
      )}
      <CollapsablePrompts dragConstraints={interfaceRef}>
        {layoutMode === 'AUTOMATIC' && (
          <SimulationPanel
            simulationEnabled={simulation.simulationEnabled}
            onToggle={simulation.toggleSimulation}
          />
        )}
      </CollapsablePrompts>
    </div>
  );
};

export default Sociogram;
