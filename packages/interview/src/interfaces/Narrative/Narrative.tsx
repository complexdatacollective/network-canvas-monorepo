'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Node from '@codaco/fresco-ui/Node';
import { entityAttributesProperty } from '@codaco/shared-consts';
import { useTrack } from '~/analytics/useTrack';
import Canvas from '~/canvas/Canvas';
import { useAutoLayout } from '~/canvas/useAutoLayout';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getCategoricalOptions,
  getNetworkEdges,
  getNetworkNodes,
} from '~/selectors/session';
import type { StageProps } from '~/types';

import Annotations, { type AnnotationsHandle } from './Annotations';
import ConvexHullLayer from './ConvexHullLayer';
import DrawingControls from './DrawingControls';
import PresetSwitcher from './PresetSwitcher';

type NarrativeProps = StageProps<'Narrative'>;

const Narrative = ({ stage }: NarrativeProps) => {
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

  // Measure the rendered node size off-screen so the layout's collision radius
  // tracks the live `--theme-root-size` scaling. A size="sm" Node matches the
  // on-canvas nodes (CanvasNode renders the same UINode at size="sm"); the
  // measured box depends only on size + the inherited cascade. The returned
  // measurementContainer is rendered INSIDE the interface div below so it
  // inherits --theme-root-size from the Shell.
  const { nodeWidth, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

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

  // Edges that drive edge-attraction in the layout. Keyed on the preset's
  // edges.display config, NOT the showEdges display toggle, so toggling edge
  // visibility does not re-run the settled layout — mirroring how cohesion keys
  // on the stable groupVariable rather than the display-gated convexHullVariable.
  const layoutEdges = useMemo(
    () =>
      displayEdgeTypes
        ? edges.filter((edge) => displayEdgeTypes.includes(edge.type))
        : [],
    [edges, displayEdgeTypes],
  );

  // Sync positions from nodes when layout variable or nodes change. This runs
  // before useAutoLayout reads store.positions to seed the simulation.
  useEffect(() => {
    store.getState().syncFromNodes(nodesWithLayout, layoutVariable);
  }, [nodesWithLayout, layoutVariable, store]);

  // Narrative shares Sociogram's full automatic-layout anneal (hot start + slow
  // cool so nodes escape local minima) and charge-driven spread; it additionally
  // applies group cohesion so same-group nodes cluster into their convex hulls.
  // The upward bias lifts the composition clear of the bottom-center preset
  // panel. Memoized so the layout does not re-seed on every render.
  const layoutOptions = useMemo(
    () => ({
      cohesion: 0.1,
      charge: -3000,
      startAlpha: 1,
      alphaMin: 0.001,
      alphaDecay: 1 - 0.001 ** (1 / 500),
      biasXStrength: 0.12,
      biasXFraction: 0.5,
      biasYStrength: 0.12,
      biasYFraction: 0.5,
    }),
    [],
  );

  // Ephemeral, read-only layout (persist:false makes syncToRedux unreachable).
  // Runs whenever there are positioned nodes so collision spacing applies to ALL
  // presets (ungrouped presets de-overlap with minimal movement from the
  // authored layout). Group cohesion is additionally active only when a
  // groupVariable is set: getGroupKeys returns [] for every node otherwise, so
  // the cohesion force is inert and can always be registered. Keyed on the
  // stable preset groupVariable, NOT the display-gated convexHullVariable:
  // toggling hulls off must not re-run the settled layout, and cohesion runs on
  // preset entry where showConvexHulls is reset to true.
  const layout = useAutoLayout({
    enabled: nodesWithLayout.length > 0,
    nodes: nodesWithLayout,
    edges: layoutEdges,
    store,
    nodeRadius: nodeWidth / 2,
    layoutVariable,
    groupVariable: currentPreset?.groupVariable ?? '',
    persist: false,
    runMode: 'once',
    mockLayout: 'identity',
    layoutOptions,
  });

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
      data-testid="narrative"
      data-simulation-running={layout.isRunning}
    >
      {measurementContainer}
      <Canvas
        background={background}
        underlays={underlays}
        foreground={foreground}
        nodes={nodesWithLayout}
        edges={filteredEdges}
        store={store}
        selectedNodeId={null}
        highlightAttribute={highlightAttribute}
        onNodeDragEnd={undefined}
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
