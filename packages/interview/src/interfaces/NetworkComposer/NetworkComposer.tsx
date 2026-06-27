'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { entityPrimaryKeyProperty, type NcEdge } from '@codaco/shared-consts';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useStageSelector } from '~/hooks/useStageSelector';
import { getNetworkEdges, getNetworkNodesForType } from '~/selectors/session';
import { getCodebook } from '~/store/modules/protocol';
import { updateNode } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';

import { useForceSimulation } from '../Sociogram/useForceSimulation';
import ComposerCanvas, { type NodeTapModifiers } from './ComposerCanvas';
import Inspector from './Inspector';
import ToolPalette from './ToolPalette';
import { useComposerActions } from './useComposerActions';
import { useComposerStore, createComposerStore } from './useComposerStore';
import { createUndoStore } from './useUndoStore';

type NetworkComposerProps = StageProps<'NetworkComposer'>;

const NetworkComposer = (stageProps: NetworkComposerProps) => {
  const { stage } = stageProps;
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const layoutVariable = stage.layoutVariable;
  const layoutMode: 'AUTOMATIC' | 'MANUAL' = stage.behaviours?.automaticLayout
    ?.enabled
    ? 'AUTOMATIC'
    : 'MANUAL';

  const nodes = useStageSelector(getNetworkNodesForType);
  const edges = useStageSelector(getNetworkEdges);

  const codebook = useSelector(getCodebook);

  const canvasStoreRef = useRef(createCanvasStore());
  const canvasStore = canvasStoreRef.current;

  const composerStoreRef = useRef(createComposerStore());
  const composerStore = composerStoreRef.current;

  const undoStoreRef = useRef(createUndoStore());
  const undoStore = undoStoreRef.current;

  const actions = useComposerActions({
    subjectType: stage.subject.type,
    quickAdd: stage.quickAdd,
    layoutVariable: stage.layoutVariable,
    currentStep,
    undoStore,
    dispatch,
  });

  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);

  const selectedNodeIds = useComposerStore(
    composerStore,
    (s) => s.selectedNodeIds,
  );
  const selectedEdgeId = useComposerStore(
    composerStore,
    (s) => s.selectedEdgeId,
  );

  // Sync node positions from Redux into the canvas store.
  // In automatic mode, only initialise new nodes — the simulation owns positions.
  useEffect(() => {
    if (layoutMode === 'AUTOMATIC') {
      canvasStore.getState().syncNewFromNodes(nodes, layoutVariable);
    } else {
      canvasStore.getState().syncFromNodes(nodes, layoutVariable);
    }
  }, [nodes, layoutVariable, canvasStore, layoutMode]);

  const simulation = useForceSimulation({
    enabled: layoutMode === 'AUTOMATIC',
    nodes,
    edges,
    layoutVariable,
    store: canvasStore,
    dispatch,
    currentStep,
  });

  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
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
    [dispatch, layoutVariable, currentStep],
  );

  const handleBackgroundTap = useCallback(
    async (position: { x: number; y: number }) => {
      const { activeTool } = composerStore.getState();
      if (activeTool.kind !== 'addNode') return;
      const id = await actions.createNodeAt('', position);
      setRenamingNodeId(id);
    },
    [composerStore, actions],
  );

  const handleNodeTap = useCallback(
    async (tappedId: string, modifiers: NodeTapModifiers) => {
      const {
        activeTool,
        pendingEdgeSource,
        setPendingEdgeSource,
        selectOnlyNode,
        toggleNodeInSelection,
      } = composerStore.getState();

      if (activeTool.kind === 'select') {
        if (modifiers.shift || modifiers.meta) {
          toggleNodeInSelection(tappedId);
        } else {
          selectOnlyNode(tappedId);
        }
        return;
      }

      if (activeTool.kind !== 'edge') {
        return;
      }

      const { edgeType } = activeTool;

      if (pendingEdgeSource === null) {
        // Arm: first tap sets the source node.
        setPendingEdgeSource(tappedId);
        return;
      }

      if (pendingEdgeSource === tappedId) {
        // Cancel: tapping the same node clears the pending source.
        setPendingEdgeSource(null);
        return;
      }

      // Complete: tap on a different node — toggle the edge undo-aware.
      const source = pendingEdgeSource;
      setPendingEdgeSource(null);

      // Read live edges at call time to avoid stale-closure bugs (same pattern
      // as connectAll in useComposerActions.ts).
      let currentEdges: NcEdge[] = [];
      dispatch((_, getState) => {
        const { session: sessionState } = getState() as {
          session: { network: { edges: NcEdge[] } };
        };
        currentEdges = sessionState.network.edges;
      });

      const existing = currentEdges.find(
        (e) =>
          e.type === edgeType &&
          ((e.from === source && e.to === tappedId) ||
            (e.from === tappedId && e.to === source)),
      );

      if (existing) {
        actions.deleteEdgeById(existing[entityPrimaryKeyProperty]);
      } else {
        await actions.connect(source, tappedId, edgeType);
      }
    },
    [composerStore, dispatch, actions],
  );

  const handleEdgeTap = useCallback(
    (edgeId: string) => {
      const { activeTool, selectEdge } = composerStore.getState();
      if (activeTool.kind !== 'select') return;
      selectEdge(edgeId);
    },
    [composerStore],
  );

  const handleCommitRename = useCallback(
    async (nodeId: string, value: string) => {
      await actions.updateNodeAttributes(nodeId, { [stage.quickAdd]: value });
      setRenamingNodeId(null);
    },
    [actions, stage.quickAdd],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }
      const ids = [...composerStore.getState().selectedNodeIds];
      if (ids.length === 0) return;
      actions.deleteNodesById(ids);
      composerStore.getState().clearSelection();
    },
    [composerStore, actions],
  );

  const edgeEntries = stage.edges.map((edgeDef) => {
    const edgeType = edgeDef.subject.type;
    const edgeCbEntry = codebook?.edge?.[edgeType];
    return {
      edgeType,
      label: edgeCbEntry?.name ?? edgeType,
      color: edgeCbEntry?.color,
    };
  });

  const concentricCircles = get(stage, 'background.concentricCircles');
  const skewedTowardCenter = get(stage, 'background.skewedTowardCenter');

  const background = (
    <ConcentricCircles n={concentricCircles} skewed={skewedTowardCenter} />
  );

  const simulationHandlers =
    layoutMode === 'AUTOMATIC'
      ? {
          moveNode: simulation.moveNode,
          releaseNode: simulation.releaseNode,
        }
      : null;

  // Resolve what the Inspector should show (if anything).
  const selectedNode =
    selectedNodeIds.size === 1
      ? (nodes.find(
          (n) => n[entityPrimaryKeyProperty] === [...selectedNodeIds][0],
        ) ?? null)
      : null;

  const selectedEdge =
    selectedEdgeId !== null
      ? (edges.find((e) => e[entityPrimaryKeyProperty] === selectedEdgeId) ??
        null)
      : null;

  const selectedEdgeFormEntry =
    selectedEdge !== null
      ? (stage.edges.find((ed) => ed.subject.type === selectedEdge.type) ??
        null)
      : null;

  return (
    // tabIndex makes the div focusable so keydown events reach it.
    <div
      className="interface relative h-dvh overflow-hidden"
      data-testid="network-composer"
      data-layout-mode={layoutMode}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <ToolPalette
        composerStore={composerStore}
        undoStore={undoStore}
        edges={edgeEntries}
        automaticLayout={layoutMode === 'AUTOMATIC'}
        simulationEnabled={simulation.simulationEnabled}
        onToggleSimulation={simulation.toggleSimulation}
      />
      {selectedNodeIds.size >= 2 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {edgeEntries.map(({ edgeType, label }) => (
            <button
              key={edgeType}
              type="button"
              className="bg-background border-primary rounded border px-3 py-1.5 text-sm font-medium shadow"
              onClick={() => {
                void actions.connectAll([...selectedNodeIds], edgeType);
              }}
            >
              {`Connect all with ${label}`}
            </button>
          ))}
        </div>
      )}
      <ComposerCanvas
        canvasStore={canvasStore}
        composerStore={composerStore}
        nodes={nodes}
        edges={edges}
        background={background}
        simulation={simulationHandlers}
        onBackgroundTap={(position) => {
          void handleBackgroundTap(position);
        }}
        onNodeTap={(nodeId, modifiers) => {
          void handleNodeTap(nodeId, modifiers);
        }}
        onEdgeTap={handleEdgeTap}
        onNodeDragEnd={handleNodeDragEnd}
        renamingNodeId={renamingNodeId}
        onCommitRename={(nodeId, value) => {
          void handleCommitRename(nodeId, value);
        }}
      />
      {selectedNode !== null && stage.nodeForm !== undefined && (
        <div className="bg-background absolute top-0 right-0 bottom-0 flex w-80 flex-col overflow-hidden shadow-lg">
          <Inspector
            kind="node"
            selectedNode={selectedNode}
            nodeForm={stage.nodeForm}
            subject={stage.subject}
            onUpdateNode={(id, data) => {
              void actions.updateNodeAttributes(id, data);
            }}
            onDeleteNode={(id) => {
              actions.deleteNodeById(id);
              composerStore.getState().clearSelection();
            }}
          />
        </div>
      )}
      {selectedEdge !== null && selectedEdgeFormEntry?.form !== undefined && (
        <div className="bg-background absolute top-0 right-0 bottom-0 flex w-80 flex-col overflow-hidden shadow-lg">
          <Inspector
            kind="edge"
            selectedEdge={selectedEdge}
            edgeForm={selectedEdgeFormEntry.form}
            onUpdateEdge={(id, data) => {
              void actions.updateEdgeAttributes(id, data);
            }}
            onDeleteEdge={(id) => {
              actions.deleteEdgeById(id);
              composerStore.getState().clearSelection();
            }}
          />
        </div>
      )}
    </div>
  );
};

export default NetworkComposer;
