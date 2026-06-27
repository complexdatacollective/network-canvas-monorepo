'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSelector } from 'react-redux';

import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useStageSelector } from '~/hooks/useStageSelector';
import { getNetworkEdges, getNetworkNodesForType } from '~/selectors/session';
import { updateNode } from '~/store/modules/session';
import { getCodebook } from '~/store/modules/protocol';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';

import { useForceSimulation } from '../Sociogram/useForceSimulation';
import ComposerCanvas from './ComposerCanvas';
import ToolPalette from './ToolPalette';
import { useComposerActions } from './useComposerActions';
import { createComposerStore } from './useComposerStore';
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

  const handleNodeTap = useCallback((_nodeId: string) => {
    // No-op: selection/inspector arrives in a later task
  }, []);

  const handleCommitRename = useCallback(
    async (nodeId: string, value: string) => {
      await actions.updateNodeAttributes(nodeId, { [stage.quickAdd]: value });
      setRenamingNodeId(null);
    },
    [actions, stage.quickAdd],
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

  return (
    <div
      className="interface relative h-dvh overflow-hidden"
      data-testid="network-composer"
      data-layout-mode={layoutMode}
    >
      <ToolPalette
        composerStore={composerStore}
        undoStore={undoStore}
        edges={edgeEntries}
        automaticLayout={layoutMode === 'AUTOMATIC'}
        simulationEnabled={simulation.simulationEnabled}
        onToggleSimulation={simulation.toggleSimulation}
      />
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
        onNodeTap={handleNodeTap}
        onNodeDragEnd={handleNodeDragEnd}
        renamingNodeId={renamingNodeId}
        onCommitRename={(nodeId, value) => {
          void handleCommitRename(nodeId, value);
        }}
      />
    </div>
  );
};

export default NetworkComposer;
