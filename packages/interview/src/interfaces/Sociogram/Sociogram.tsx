'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import type { DragMetadata } from '@codaco/fresco-ui/dnd/types';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import Node from '@codaco/fresco-ui/Node';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import Canvas from '../../canvas/Canvas';
import { useAutoLayout } from '../../canvas/useAutoLayout';
import { createCanvasStore, useCanvasStore } from '../../canvas/useCanvasStore';
import ConcentricCircles from '../../components/ConcentricCircles';
import NodeDrawer from '../../components/NodeDrawer';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { useNodeMeasurement } from '../../hooks/useNodeMeasurement';
import useSortedNodeList from '../../hooks/useSortedNodeList';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getEdges,
  getPlacedNodes,
  getUnplacedNodes,
} from '../../selectors/canvas';
import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import {
  getNetworkNodesForType,
  getPromptSortOrder,
} from '../../selectors/session';
import {
  toggleEdge,
  toggleNodeAttributes,
  updateNode,
} from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import CollapsablePrompts from './CollapsablePrompts';
import SimulationPanel from './SimulationPanel';

type SociogramProps = StageProps<'Sociogram'>;

// DnD item type registered while dragging an already-placed node, so the
// unplaced-node drawer can accept it back.
const PLACED_NODE_ITEM_TYPE = 'PLACED_NODE';

const Sociogram = (stageProps: SociogramProps) => {
  const { stage } = stageProps;
  const { prompt } = usePrompts<(typeof stage.prompts)[number]>();
  const dispatch = useAppDispatch();
  const { announce } = useAccessibilityAnnouncements();

  const interfaceRef = useRef<HTMLDivElement>(null);

  // Behaviour Configuration
  const createEdge = prompt.edges?.create ?? null;

  // Display Properties
  const layoutVariable = prompt.layout.layoutVariable;
  // The schema's highlight union proves a variable exists whenever
  // highlighting is enabled, so one narrowed read replaces the paired guards.
  const highlightAttribute = prompt.highlight?.allowHighlighting
    ? prompt.highlight.variable
    : undefined;
  const layoutMode: 'AUTOMATIC' | 'MANUAL' = stage.behaviours?.automaticLayout
    ? 'AUTOMATIC'
    : 'MANUAL';

  // Background Configuration
  const stageBackground = stage.background;
  const { url: backgroundImage } = useAssetUrl(stageBackground.image);

  const { currentStep } = useCurrentStep();
  const track = useTrack();
  const allNodes = useStageSelector(getNetworkNodesForType);
  const placedNodes = useStageSelector(getPlacedNodes);
  const unplacedNodes = useStageSelector(getUnplacedNodes);
  const sortOrder = useStageSelector(getPromptSortOrder);
  const sortedUnplacedNodes = useSortedNodeList(unplacedNodes, sortOrder);

  const canvasNodes = layoutMode === 'AUTOMATIC' ? allNodes : placedNodes;
  const edges = useStageSelector(getEdges);

  // Zustand store for real-time positions
  const storeRef = useRef(createCanvasStore());
  const store = storeRef.current;

  // Measure the rendered node size off-screen so the layout's collision radius
  // tracks the live `--theme-root-size` scaling. A size="sm" Node matches the
  // on-canvas nodes; the returned measurementContainer is rendered INSIDE the
  // interface div below so it inherits --theme-root-size from the Shell.
  const { nodeWidth, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // Sync positions from Redux when nodes or layout variable change.
  // In automatic mode, only initialize new nodes — the simulation owns positions.
  useEffect(() => {
    if (layoutMode === 'AUTOMATIC') {
      store.getState().syncNewFromNodes(canvasNodes, layoutVariable);
    } else {
      store.getState().syncFromNodes(canvasNodes, layoutVariable);
    }
  }, [canvasNodes, layoutVariable, store, layoutMode]);

  // Sociogram force tuning (SIM space: px / canvas height, coordinates ~0..aspect,
  // so charge/bias are screen-independent). No group cohesion acts (no convex
  // hulls, so no groupVariable is supplied and the engine's cohesion force is
  // inert); spread relies on charge. A weak symmetric forceX/forceY keeps the
  // layout centred and slightly up to clear the bottom prompt panel.
  //
  // Unlike Narrative (which gently REFINES already-meaningful authored positions),
  // Sociogram lays out FROM SCRATCH, so it needs a full anneal to escape local
  // minima: a hot start (startAlpha 1) gives nodes enough energy to break free of
  // inefficient positions, and a slow alphaDecay lets it cool over ~500 ticks
  // rather than freezing early into a tangled local optimum.
  //
  // charge/bias are reasoned STARTING values for the new ~0..1.x coordinate scale
  // and need a visual tuning pass — the old px charge (-3000) does not translate
  // linearly to sim space. Tune visually.
  const layoutOptions = useMemo(
    () => ({
      charge: -0.006,
      startAlpha: 1,
      alphaMin: 0.025,
      alphaDecay: 1 - 0.001 ** (1 / 500),
      biasXStrength: 0.13,
      biasXFraction: 0.5,
      biasYStrength: 0.13,
      biasYFraction: 0.5,
    }),
    [],
  );

  // Force simulation (only active in AUTOMATIC mode). Continuous, user-toggleable,
  // and persists settled positions back to Redux.
  const simulation = useAutoLayout({
    enabled: layoutMode === 'AUTOMATIC',
    nodes: canvasNodes,
    edges,
    store,
    nodeRadius: nodeWidth / 2,
    layoutVariable,
    groupVariable: '',
    persist: true,
    dispatch,
    currentStep,
    runMode: 'continuous',
    mockLayout: 'grid',
    layoutOptions,
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
            ? Date.now() - simStartedAtRef.current
            : 0,
        node_count: canvasNodes.length,
        edge_count: edges.length,
      });
      simStartedAtRef.current = null;
    }
    wasRunningRef.current = simulation.isRunning;
  }, [simulation.isRunning, canvasNodes.length, edges.length, track]);

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
      } else if (highlightAttribute) {
        const node = canvasNodes.find(
          (n) => n[entityPrimaryKeyProperty] === nodeId,
        );
        if (node) {
          const currentValue =
            node[entityAttributesProperty][highlightAttribute];
          track(currentValue ? 'node_deselected' : 'node_selected', {
            node_id: nodeId,
          });
          dispatch(
            toggleNodeAttributes({
              nodeId,
              attributes: { [highlightAttribute]: !currentValue },
            }),
          );
        }
      }
    },
    [
      createEdge,
      store,
      dispatch,
      highlightAttribute,
      canvasNodes,
      track,
      currentStep,
    ],
  );

  // Handle drag end: sync single position to Redux
  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (layoutMode === 'MANUAL') {
        track('node_repositioned', { node_id: nodeId });
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
      if (layoutMode === 'MANUAL') {
        track('node_initial_positioned', { node_id: nodeId });
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

  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);

  // Unplace a node: clearing the layout variable returns it to the drawer.
  // Reached by dragging a placed node onto the drawer, or by pressing
  // Delete/Backspace on a focused node.
  const handleUnplaceNode = useCallback(
    (nodeId: string) => {
      const node = allNodes.find((n) => n[entityPrimaryKeyProperty] === nodeId);

      // Resolve the node's visible label synchronously for the announcement.
      // Non-string values (e.g. encrypted attributes) fall back to a nameless
      // announcement rather than leaking or garbling the label.
      let name: string | null = null;
      if (node) {
        const attributes = node[entityAttributesProperty];
        const labelAttribute = getNodeLabelAttribute(
          getCodebookForNodeType(node.type)?.variables,
          attributes,
        );
        const rawLabel = labelAttribute ? attributes[labelAttribute] : null;
        if (typeof rawLabel === 'string' || typeof rawLabel === 'number') {
          name = String(rawLabel);
        }
      }

      track('node_unplaced', { node_id: nodeId });
      void dispatch(
        updateNode({
          nodeId,
          newAttributeData: { [layoutVariable]: null },
          currentStep,
        }),
      );
      announce(
        name ? `${name} returned to the drawer.` : 'Returned to the drawer.',
      );
    },
    [
      allNodes,
      getCodebookForNodeType,
      dispatch,
      layoutVariable,
      currentStep,
      track,
      announce,
    ],
  );

  const drawerDropTarget = useMemo(
    () => ({
      accepts: [PLACED_NODE_ITEM_TYPE],
      announcedName: 'Drawer',
      onDrop: (metadata?: DragMetadata) => {
        const nodeId = metadata?.nodeId;
        if (typeof nodeId === 'string') handleUnplaceNode(nodeId);
      },
    }),
    [handleUnplaceNode],
  );

  // Branch on the schema's image/circles union: in the circles variant
  // concentricCircles is proven present. An image renders nothing until its
  // asset URL resolves.
  const background =
    stageBackground.image !== undefined ? (
      backgroundImage ? (
        <img
          src={backgroundImage}
          className="size-full object-cover"
          alt="Background"
        />
      ) : null
    ) : (
      <ConcentricCircles
        n={stageBackground.concentricCircles}
        skewed={stageBackground.skewedTowardCenter}
      />
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
      className="interface h-dvh overflow-hidden"
      ref={interfaceRef}
      data-testid="sociogram"
      data-layout-mode={layoutMode}
      data-simulation-running={simulation.isRunning}
    >
      {measurementContainer}
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
        simulation={simulationHandlers}
        nodeDragItemType={
          layoutMode === 'MANUAL' ? PLACED_NODE_ITEM_TYPE : undefined
        }
        onNodeRemove={layoutMode === 'MANUAL' ? handleUnplaceNode : null}
      />
      {layoutMode === 'MANUAL' && (
        <NodeDrawer
          nodes={sortedUnplacedNodes}
          floating
          dropTarget={drawerDropTarget}
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
