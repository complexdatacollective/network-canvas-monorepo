'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import Node from '@codaco/fresco-ui/Node';
import type { ComposerForm } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  isNetworkComposerStageMetadata,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import ConvexHullLayer from '~/canvas/ConvexHullLayer';
import { useAutoLayout } from '~/canvas/useAutoLayout';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useAssetUrl } from '~/hooks/useAssetUrl';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import type { Subject } from '~/selectors/forms';
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
import ComposerDrawer from './ComposerDrawer';
import { nextGridPosition } from './gridPlacement';
import type { ActiveGroup, GroupVariable } from './GroupPicker';
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

type DrawerEditor = {
  kind: 'node' | 'edge';
  entityId: string;
  title: string;
  form: ComposerForm | undefined;
  subject: Subject;
  attributes: NcNode[typeof entityAttributesProperty];
};

const NetworkComposer = (stageProps: NetworkComposerProps) => {
  const { stage } = stageProps;
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const layoutVariable = stage.layoutVariable;

  // Background Configuration
  const { url: backgroundImage } = useAssetUrl(stage.background.image);
  const concentricCircles = stage.background.concentricCircles;
  const skewedTowardCenter = stage.background.skewedTowardCenter;

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
  const nodeLabel =
    codebook?.node?.[stage.subject.type]?.name ?? stage.subject.type;

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

  const selectedNodeIds = useComposerStore(
    composerStore,
    (s) => s.selectedNodeIds,
  );
  const selectedEdgeId = useComposerStore(
    composerStore,
    (s) => s.selectedEdgeId,
  );
  const currentTool = useComposerStore(composerStore, (s) => s.activeTool);

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

  // The categorical variable configured for convex-hull groups, with its
  // options; null when unset, missing from the codebook, or not categorical.
  const nodeVariables = codebook?.node?.[stage.subject.type]?.variables ?? {};
  const hullVariableId = stage.convexHullVariable;
  const hullVariable =
    hullVariableId !== undefined ? nodeVariables[hullVariableId] : undefined;
  const hullOptions =
    hullVariable && 'options' in hullVariable
      ? hullVariable.options
      : undefined;
  const groupVariable: GroupVariable | null =
    hullVariableId !== undefined && hullVariable && hullOptions
      ? {
          id: hullVariableId,
          label: hullVariable.name ?? hullVariableId,
          options: hullOptions.map((option) => ({
            value: String(option.value),
            label: option.label ?? String(option.value),
          })),
        }
      : null;

  // Force tuning mirrors the Sociogram: lay out from scratch with a hot start
  // and slow cooldown. The engine's internal group cohesion clusters same-group
  // (convex-hull) nodes — switched on by supplying groupVariable below, and
  // inert when no hull variable is configured because getGroupKeys returns []
  // for every node.
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
    groupVariable: groupVariable?.id ?? '',
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

  // Nodes are added by name from the tool palette (not by tapping the canvas),
  // each landing on the next free grid cell from the top-left.
  const handleAddNode = useCallback(
    (name: string) => {
      const occupied = nodes
        .map((n) => n[entityAttributesProperty]?.[layoutVariable])
        .filter(isPosition);
      void actions.createNodeAt(name, nextGridPosition(occupied));
    },
    [nodes, layoutVariable, actions],
  );

  const handleBackgroundTap = useCallback(() => {
    rootRef.current?.focus();
    const { clearSelection, setPendingEdgeSource } = composerStore.getState();
    clearSelection();
    setPendingEdgeSource(null);
  }, [composerStore]);

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

      if (activeTool.kind === 'group') {
        // Toggle this node's membership in the active group (a categorical value).
        void actions.toggleGroupMembership(
          tappedId,
          activeTool.variable,
          activeTool.value,
        );
        return;
      }

      if (activeTool.kind !== 'edge') {
        return;
      }

      const { edgeType } = activeTool;

      if (pendingEdgeSource === null) {
        // Arm: the first node tapped enters the linking state.
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

      // Read live edges at call time to avoid stale-closure bugs.
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

  const edgeEntries = (stage.edges ?? []).map((edgeDef) => {
    const edgeType = edgeDef.subject.type;
    const edgeCbEntry = codebook?.edge?.[edgeType];
    return {
      edgeType,
      label: edgeCbEntry?.name ?? edgeType,
      color: edgeCbEntry?.color,
    };
  });

  const handleSelectGroup = useCallback(
    (variable: string, value: string) => {
      composerStore
        .getState()
        .setActiveTool({ kind: 'group', variable, value });
    },
    [composerStore],
  );

  const activeGroup: ActiveGroup | null =
    currentTool.kind === 'group'
      ? { variable: currentTool.variable, value: currentTool.value }
      : null;
  // The active group's variable can only be the stage's single hull variable.
  const activeGroupLabel =
    activeGroup !== null
      ? (groupVariable?.options.find(
          (option) => option.value === activeGroup.value,
        )?.label ?? activeGroup.value)
      : '';

  // Hulls are always drawn when a hull variable is configured, so participants
  // can see groups while adding to them from select mode.
  const hulls =
    groupVariable !== null ? (
      <ConvexHullLayer
        store={canvasStore}
        nodes={nodes}
        groupVariable={groupVariable.id}
        categoricalOptions={groupVariable.options}
      />
    ) : null;

  // Bulk group assignment for a multi-node selection: in group mode a single
  // button targets the active group; in select mode (where lasso selection is
  // enabled by the hull variable) one button per group option. Each button is
  // painted with its group's hull colour (1-based option position → --cat-N,
  // matching ConvexHullLayer). The selection is deliberately kept afterwards
  // so a multi-membership assignment can follow.
  const groupColorIndex = (value: string) => {
    const index =
      groupVariable?.options.findIndex((option) => option.value === value) ??
      -1;
    return index >= 0 ? index + 1 : undefined;
  };
  const selectionBarButtons = (() => {
    if (selectedNodeIds.size < 2) return [];
    if (activeGroup !== null) {
      return [
        {
          value: activeGroup.value,
          label: `Add all to ${activeGroupLabel}`,
          colorIndex: groupColorIndex(activeGroup.value),
          onClick: () => {
            void actions.addGroupMembership(
              [...selectedNodeIds],
              activeGroup.variable,
              activeGroup.value,
            );
          },
        },
      ];
    }
    if (currentTool.kind === 'select' && groupVariable !== null) {
      return groupVariable.options.map((option, index) => ({
        value: option.value,
        label: `Add all to ${option.label}`,
        colorIndex: index + 1,
        onClick: () => {
          void actions.addGroupMembership(
            [...selectedNodeIds],
            groupVariable.id,
            option.value,
          );
        },
      }));
    }
    return [];
  })();

  const background = backgroundImage ? (
    <img
      src={backgroundImage}
      className="size-full object-cover"
      alt="Background"
    />
  ) : (
    <ConcentricCircles n={concentricCircles} skewed={skewedTowardCenter} />
  );

  const simulationHandlers =
    layoutMode === 'AUTOMATIC'
      ? {
          moveNode: simulation.moveNode,
          releaseNode: simulation.releaseNode,
        }
      : null;

  // Resolve what the drawer should show (if anything).
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
      ? ((stage.edges ?? []).find(
          (ed) => ed.subject.type === selectedEdge.type,
        ) ?? null)
      : null;

  // The drawer opens for any single node or edge selection — even when there is
  // no form to edit (it then shows an empty state).
  const currentEditor: DrawerEditor | null = (() => {
    if (selectedNode !== null) {
      const rawName = selectedNode[entityAttributesProperty]?.[stage.quickAdd];
      const title =
        typeof rawName === 'string' && rawName.trim() !== ''
          ? rawName
          : nodeLabel;
      return {
        kind: 'node',
        entityId: selectedNode[entityPrimaryKeyProperty],
        title,
        form: stage.nodeForm,
        subject: stage.subject,
        attributes: selectedNode[entityAttributesProperty],
      };
    }
    if (selectedEdge !== null) {
      return {
        kind: 'edge',
        entityId: selectedEdge[entityPrimaryKeyProperty],
        title: codebook?.edge?.[selectedEdge.type]?.name ?? selectedEdge.type,
        form: selectedEdgeFormEntry?.form,
        subject: { entity: 'edge', type: selectedEdge.type },
        attributes: selectedEdge[entityAttributesProperty],
      };
    }
    return null;
  })();

  // Retain the last editor so its contents stay rendered through the drawer's
  // slide-out animation after the selection clears.
  const lastEditorRef = useRef(currentEditor);
  useEffect(() => {
    if (currentEditor !== null) lastEditorRef.current = currentEditor;
  }, [currentEditor]);
  const editor = currentEditor ?? lastEditorRef.current;

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
        nodeLabel={nodeLabel}
        onAddNode={handleAddNode}
        groupVariable={groupVariable}
        activeGroup={activeGroup}
        onSelectGroup={handleSelectGroup}
        automaticLayout={automaticLayout}
        onToggleAutomaticLayout={handleToggleAutomaticLayout}
      />
      {selectionBarButtons.length > 0 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {selectionBarButtons.map((button) => (
            <button
              key={button.value}
              type="button"
              className={
                button.colorIndex !== undefined
                  ? 'rounded border border-transparent px-3 py-1.5 text-sm font-medium text-white shadow'
                  : 'bg-background border-primary rounded border px-3 py-1.5 text-sm font-medium shadow'
              }
              style={
                button.colorIndex !== undefined
                  ? { backgroundColor: `var(--cat-${button.colorIndex})` }
                  : undefined
              }
              onClick={button.onClick}
            >
              {button.label}
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
        hulls={hulls}
        lassoInSelectMode={groupVariable !== null}
        simulation={simulationHandlers}
        onBackgroundTap={handleBackgroundTap}
        onNodeTap={(nodeId, modifiers) => {
          void handleNodeTap(nodeId, modifiers);
        }}
        onEdgeTap={handleEdgeTap}
        onNodeDragEnd={handleNodeDragEnd}
      />
      <ComposerDrawer
        open={currentEditor !== null}
        onClose={() => composerStore.getState().clearSelection()}
        title={editor?.title ?? ''}
      >
        {editor !== null && (
          <Inspector
            key={editor.entityId}
            entityId={editor.entityId}
            form={editor.form}
            subject={editor.subject}
            attributes={editor.attributes}
            onSave={(id, data) => {
              if (editor.kind === 'node') {
                void actions.updateNodeAttributes(id, data, `node-attr:${id}`);
              } else {
                void actions.updateEdgeAttributes(id, data, `edge-attr:${id}`);
              }
            }}
            onDelete={(id) => {
              if (editor.kind === 'node') {
                actions.deleteNodeById(id);
              } else {
                actions.deleteEdgeById(id);
              }
              composerStore.getState().clearSelection();
            }}
          />
        )}
      </ComposerDrawer>
    </div>
  );
};

export default NetworkComposer;
