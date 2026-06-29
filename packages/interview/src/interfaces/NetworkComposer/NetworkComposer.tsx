'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import Node from '@codaco/fresco-ui/Node';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  isNetworkComposerStageMetadata,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import { useAutoLayout } from '~/canvas/useAutoLayout';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNetworkEdges,
  getNetworkNodesForType,
  getStageMetadata,
} from '~/selectors/session';
import { getCodebook } from '~/store/modules/protocol';
import { updateNode, updateStageMetadata } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';

import ComposerCanvas, { type NodeTapModifiers } from './ComposerCanvas';
import Inspector from './Inspector';
import ToolPalette from './ToolPalette';
import { useComposerActions } from './useComposerActions';
import { useComposerStore, createComposerStore } from './useComposerStore';
import { createUndoStore } from './useUndoStore';

type NetworkComposerProps = StageProps<'NetworkComposer'>;

const isPosition = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' &&
  value !== null &&
  'x' in value &&
  'y' in value &&
  typeof value.x === 'number' &&
  typeof value.y === 'number';

const NetworkComposer = (stageProps: NetworkComposerProps) => {
  const { stage } = stageProps;
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const layoutVariable = stage.layoutVariable;

  // Automatic layout is an interview-time choice, not a fixed stage config. The
  // schema's automaticLayout boolean only seeds the initial value; the
  // participant's live toggle is persisted in stage metadata so it sticks across
  // navigation.
  const stageMetadata = useStageSelector(getStageMetadata);
  const automaticLayoutDefault = stage.behaviours?.automaticLayout ?? false;
  const persistedAutomaticLayout = isNetworkComposerStageMetadata(stageMetadata)
    ? stageMetadata.automaticLayout
    : undefined;
  const automaticLayout = persistedAutomaticLayout ?? automaticLayoutDefault;
  const layoutMode: 'AUTOMATIC' | 'MANUAL' = automaticLayout
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

  const rootRef = useRef<HTMLDivElement>(null);

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

  // Measure the rendered node size off-screen so the auto-layout collision radius
  // tracks the live --theme-root-size scaling (mirrors the Sociogram).
  const { nodeWidth, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // Force tuning mirrors the Sociogram: lay out from scratch with a hot start and
  // slow cooldown, and no group cohesion (NetworkComposer is free-form).
  const layoutOptions = useMemo(
    () => ({
      cohesion: 0,
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

  // Shared force-directed engine — continuous and user-toggleable, persisting
  // settled positions back to Redux (same as the Sociogram). Active only when
  // automatic layout is on.
  const simulation = useAutoLayout({
    enabled: automaticLayout,
    nodes,
    edges,
    store: canvasStore,
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

  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const node = nodes.find((n) => n[entityPrimaryKeyProperty] === nodeId);
      const rawPrev = node?.[entityAttributesProperty]?.[layoutVariable];
      const previous = isPosition(rawPrev) ? rawPrev : null;

      if (previous !== null) {
        void actions.repositionNode(nodeId, position, previous);
      } else {
        // Node has no persisted layout position yet (e.g. auto-positioned by
        // the simulation). No meaningful prior position to restore, so fall
        // back to a direct update without an undo entry.
        void dispatch(
          updateNode({
            nodeId,
            newAttributeData: { [layoutVariable]: position },
            currentStep,
          }),
        );
      }
    },
    [actions, nodes, dispatch, layoutVariable, currentStep],
  );

  const handleBackgroundTap = useCallback(
    async (position: { x: number; y: number }) => {
      rootRef.current?.focus();
      const { activeTool, clearSelection, setPendingEdgeSource } =
        composerStore.getState();
      if (activeTool.kind === 'addNode') {
        const id = await actions.createNodeAt('', position);
        setRenamingNodeId(id);
      } else {
        clearSelection();
        setPendingEdgeSource(null);
      }
    },
    [composerStore, actions],
  );

  const handleNodeTap = useCallback(
    async (tappedId: string, modifiers: NodeTapModifiers) => {
      rootRef.current?.focus();
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
      rootRef.current?.focus();
      const { activeTool, selectEdge } = composerStore.getState();
      if (activeTool.kind !== 'select') return;
      selectEdge(edgeId);
    },
    [composerStore],
  );

  const handleCommitRename = useCallback(
    async (nodeId: string, value: string) => {
      // Skip the update (and the undo entry) when the value hasn't changed.
      // This matters for the create-then-immediately-blur flow: a freshly-created
      // node has quickAdd === ''; blurring without typing must not push a
      // spurious "update attributes" entry on top of the "Add node" entry —
      // otherwise a single ⌘Z would only blank the name instead of removing
      // the node.
      let currentValue: string | undefined;
      if (stage.quickAdd !== null) {
        const quickAddKey = stage.quickAdd;
        dispatch((_, getState) => {
          const { session: sessionState } = getState() as {
            session: { network: { nodes: NcNode[] } };
          };
          const node = sessionState.network.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === nodeId,
          );
          if (node) {
            const raw = node[entityAttributesProperty][quickAddKey];
            currentValue = typeof raw === 'string' ? raw : undefined;
          }
        });
      }

      if (stage.quickAdd !== null && value !== (currentValue ?? '')) {
        await actions.updateNodeAttributes(nodeId, { [stage.quickAdd]: value });
      }
      setRenamingNodeId(null);
    },
    [actions, stage.quickAdd, dispatch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inFormField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT';

      const isUndo =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        (e.key === 'z' || e.key === 'Z');
      const isRedo =
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === 'z' || e.key === 'Z');
      const isDelete = e.key === 'Delete' || e.key === 'Backspace';

      if (inFormField) return;

      if (isUndo) {
        e.preventDefault();
        void undoStore.getState().undo();
        return;
      }

      if (isRedo) {
        e.preventDefault();
        void undoStore.getState().redo();
        return;
      }

      if (isDelete) {
        const {
          selectedNodeIds: nodeIds,
          selectedEdgeId: edgeId,
          clearSelection,
        } = composerStore.getState();
        if (nodeIds.size > 0) {
          actions.deleteNodesById([...nodeIds]);
          clearSelection();
        } else if (edgeId !== null) {
          actions.deleteEdgeById(edgeId);
          clearSelection();
        }
      }
    },
    [composerStore, undoStore, actions],
  );

  const handleToggleAutomaticLayout = useCallback(
    (next: boolean) => {
      dispatch(
        updateStageMetadata({
          currentStep,
          metadata: { automaticLayout: next },
        }),
      );
    },
    [dispatch, currentStep],
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
      ref={rootRef}
      className="interface relative h-dvh overflow-hidden"
      data-testid="network-composer"
      data-layout-mode={layoutMode}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {measurementContainer}
      <ToolPalette
        composerStore={composerStore}
        undoStore={undoStore}
        edges={edgeEntries}
        automaticLayout={automaticLayout}
        onToggleAutomaticLayout={handleToggleAutomaticLayout}
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
