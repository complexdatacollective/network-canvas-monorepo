'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { entityAttributesProperty } from '@codaco/shared-consts';
import { useTrack } from '~/analytics/useTrack';
import Canvas from '~/canvas/Canvas';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getCategoricalOptions,
  getNetworkEdges,
  getNetworkNodes,
} from '~/selectors/session';
import { updateNode } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';
import type { VariableOptions } from '~/utils/codebook';

import Annotations, { type AnnotationsHandle } from './Annotations';
import ConvexHullLayer from './ConvexHullLayer';
import DrawingControls from './DrawingControls';
import PresetSwitcher from './PresetSwitcher';

type NarrativeProps = StageProps<'Narrative'>;

const Narrative = ({ stage }: NarrativeProps) => {
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const nodes = useStageSelector(getNetworkNodes);
  const edges = useStageSelector(getNetworkEdges);
  const interfaceRef = useRef<HTMLDivElement>(null);

  const [presetIndex, setPresetIndex] = useState(0);
  const [showConvexHulls, setShowConvexHulls] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showHighlightedNodes, setShowHighlightedNodes] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);

  const annotationLayer = useRef<AnnotationsHandle>(null);

  // Zustand store for real-time positions
  const storeRef = useRef(createCanvasStore());
  const store = storeRef.current;

  const handleToggleDrawing = useCallback(() => {
    setIsDrawingEnabled((prev) => !prev);
  }, []);

  const handleToggleHulls = useCallback(() => {
    setShowConvexHulls((prev) => !prev);
  }, []);

  const handleToggleEdges = useCallback(() => {
    setShowEdges((prev) => !prev);
  }, []);

  const handleToggleHighlighting = useCallback(() => {
    setShowHighlightedNodes((prev) => !prev);
  }, []);

  const handleChangeHighlightIndex = useCallback((index: number) => {
    setHighlightIndex(index);
  }, []);

  const handleToggleFreeze = useCallback(() => {
    setIsFrozen((prev) => !prev);
  }, []);

  const track = useTrack();

  const handleResetInteractions = useCallback(() => {
    track('annotations_reset');
    annotationLayer.current?.reset();
  }, [track]);

  const handleChangePreset = useCallback(
    (index: number) => {
      if (index !== presetIndex) {
        const direction =
          index > presetIndex
            ? 'forward'
            : index < presetIndex
              ? 'back'
              : 'jumped';
        track('narrative_preset_changed', { preset_index: index, direction });
        setShowConvexHulls(true);
        setShowEdges(true);
        setShowHighlightedNodes(true);
        setHighlightIndex(0);
        setPresetIndex(index);
      }
    },
    [presetIndex, track],
  );

  useEffect(() => {
    track('narrative_preset_updated', {
      preset_index: presetIndex,
      changed: 'highlight',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIndex]);

  const skipFirstHullsRef = useRef(true);
  useEffect(() => {
    if (skipFirstHullsRef.current) {
      skipFirstHullsRef.current = false;
      return;
    }
    track('narrative_preset_updated', {
      preset_index: presetIndex,
      changed: 'group',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConvexHulls]);

  const skipFirstEdgesRef = useRef(true);
  useEffect(() => {
    if (skipFirstEdgesRef.current) {
      skipFirstEdgesRef.current = false;
      return;
    }
    track('narrative_preset_updated', {
      preset_index: presetIndex,
      changed: 'edge_type',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEdges]);

  // Stage properties
  const { presets } = stage;
  const currentPreset = presets[presetIndex];

  // Behaviour Configuration
  const allowRepositioning = get(stage, 'behaviours.allowRepositioning', false);
  const freeDraw = get(stage, 'behaviours.freeDraw', false);

  // Display Properties
  const layoutVariable = currentPreset?.layoutVariable ?? '';
  const highlight = currentPreset?.highlight ?? [];
  const convexHullVariable = showConvexHulls
    ? (currentPreset?.groupVariable ?? '')
    : '';

  // Background Configuration
  const concentricCircles = get(stage, 'background.concentricCircles');
  const skewedTowardCenter = get(stage, 'background.skewedTowardCenter');

  // Only include nodes that have the layout variable set
  const nodesWithLayout = useMemo(
    () =>
      layoutVariable
        ? nodes.filter((node) => node[entityAttributesProperty][layoutVariable])
        : [],
    [nodes, layoutVariable],
  );

  // Filter edges by display types
  const displayEdgeTypes = currentPreset?.edges?.display;
  const filteredEdges = useMemo(
    () =>
      showEdges && displayEdgeTypes
        ? edges.filter((edge) => displayEdgeTypes.includes(edge.type))
        : [],
    [edges, showEdges, displayEdgeTypes],
  );

  // Sync positions from nodes when layout variable or nodes change
  useEffect(() => {
    store.getState().syncFromNodes(nodesWithLayout, layoutVariable);
  }, [nodesWithLayout, layoutVariable, store]);

  // Handle drag end: sync single position to Redux
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

  // Get categorical options for convex hulls. Use useStageSelector (which
  // reads displayedStep, not currentStep) so a stale render during a stage
  // exit animation doesn't briefly resolve options against the next stage's
  // subject type.
  const categoricalOptions = useStageSelector((state, step) =>
    getCategoricalOptions(state, step, {
      variableId: convexHullVariable,
    }),
  );

  // Highlight attribute
  const highlightAttribute = showHighlightedNodes
    ? (highlight[highlightIndex] ?? undefined)
    : undefined;

  const background = (
    <ConcentricCircles n={concentricCircles} skewed={skewedTowardCenter} />
  );

  const underlays = convexHullVariable ? (
    <ConvexHullLayer
      store={store}
      nodes={nodesWithLayout}
      groupVariable={convexHullVariable}
      categoricalOptions={categoricalOptions}
    />
  ) : null;

  const foreground =
    freeDraw && isDrawingEnabled ? (
      <Annotations ref={annotationLayer} isFrozen={isFrozen} />
    ) : null;

  return (
    <div
      className="interface relative h-dvh overflow-hidden"
      ref={interfaceRef}
    >
      <Canvas
        background={background}
        underlays={underlays}
        foreground={foreground}
        nodes={nodesWithLayout}
        edges={filteredEdges}
        store={store}
        selectedNodeId={null}
        highlightAttribute={highlightAttribute}
        onNodeDragEnd={handleNodeDragEnd}
        allowRepositioning={allowRepositioning}
        simulation={null}
      />
      <PresetSwitcher
        presets={presets}
        activePreset={presetIndex}
        highlightIndex={highlightIndex}
        showHighlighting={showHighlightedNodes}
        showEdges={showEdges}
        showHulls={showConvexHulls}
        onChangePreset={handleChangePreset}
        onToggleHulls={handleToggleHulls}
        onToggleEdges={handleToggleEdges}
        onChangeHighlightIndex={handleChangeHighlightIndex}
        onToggleHighlighting={handleToggleHighlighting}
        dragConstraints={interfaceRef}
      />
      {freeDraw && (
        <DrawingControls
          isDrawingEnabled={isDrawingEnabled}
          isFrozen={isFrozen}
          onToggleDrawing={handleToggleDrawing}
          onToggleFreeze={handleToggleFreeze}
          onReset={handleResetInteractions}
        />
      )}
    </div>
  );
};

export default Narrative;
