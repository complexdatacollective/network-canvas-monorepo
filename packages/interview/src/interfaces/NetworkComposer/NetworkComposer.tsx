'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useRef } from 'react';

import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useStageSelector } from '~/hooks/useStageSelector';
import { getNetworkEdges, getNetworkNodesForType } from '~/selectors/session';
import { updateNode } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';

import { useForceSimulation } from '../Sociogram/useForceSimulation';
import ComposerCanvas from './ComposerCanvas';
import { createComposerStore } from './useComposerStore';

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

  const canvasStoreRef = useRef(createCanvasStore());
  const canvasStore = canvasStoreRef.current;

  const composerStoreRef = useRef(createComposerStore());
  const composerStore = composerStoreRef.current;

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
    (_position: { x: number; y: number }) => {
      // No-op: node creation arrives in a later task
    },
    [],
  );

  const handleNodeTap = useCallback((_nodeId: string) => {
    // No-op: selection/inspector arrives in a later task
  }, []);

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
      className="interface h-dvh overflow-hidden"
      data-testid="network-composer"
      data-layout-mode={layoutMode}
    >
      <ComposerCanvas
        canvasStore={canvasStore}
        composerStore={composerStore}
        nodes={nodes}
        edges={edges}
        background={background}
        simulation={simulationHandlers}
        onBackgroundTap={handleBackgroundTap}
        onNodeTap={handleNodeTap}
        onNodeDragEnd={handleNodeDragEnd}
      />
    </div>
  );
};

export default NetworkComposer;
