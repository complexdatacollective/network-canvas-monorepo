'use client';

import { get } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Node from '@codaco/fresco-ui/Node';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import { useTrack } from '~/analytics/useTrack';
import Canvas from '~/canvas/Canvas';
import CanvasBackgroundImage from '~/canvas/CanvasBackgroundImage';
import ConvexHullLayer from '~/canvas/ConvexHullLayer';
import { useAutoLayout } from '~/canvas/useAutoLayout';
import { createCanvasStore } from '~/canvas/useCanvasStore';
import ConcentricCircles from '~/components/ConcentricCircles';
import { useAssetUrl } from '~/hooks/useAssetUrl';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getCategoricalOptions,
  getNetworkEdges,
  getNetworkNodes,
} from '~/selectors/session';
import type { StageProps } from '~/types';

import Annotations, { type AnnotationsHandle } from './Annotations';
import BehavioursPanel from './BehavioursPanel';
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
  // Default OFF: the automatic layout only runs when a protocol explicitly
  // enables it (Architect sets it on for new Narrative stages). A stage that
  // leaves it unset keeps its hand-authored static node positions.
  const automaticLayoutEnabled = get(
    stage,
    'behaviours.automaticLayout',
    false,
  );

  // Display Properties
  const layoutVariable = currentPreset?.layoutVariable ?? '';
  const highlight = currentPreset?.highlight ?? [];
  const convexHullVariable = showConvexHulls
    ? (currentPreset?.groupVariable ?? '')
    : '';

  // Background Configuration
  const stageBackground = stage.background;
  const { url: backgroundImage } = useAssetUrl(stageBackground.image);

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

  // Replay authored positions only when the SET of laid-out nodes or the layout
  // variable changes — not on unrelated node-attribute updates, which would
  // otherwise snap the live interactive layout back to its authored coords
  // mid-session.
  const nodeIdsKey = useMemo(
    () =>
      nodesWithLayout
        .map((node) => node[entityPrimaryKeyProperty])
        .toSorted((a, b) => a.localeCompare(b))
        .join(','),
    [nodesWithLayout],
  );
  const nodesWithLayoutRef = useRef(nodesWithLayout);
  nodesWithLayoutRef.current = nodesWithLayout;

  // Sync positions from nodes when layout variable or the node set changes. This
  // runs before useAutoLayout reads store.positions to seed the simulation.
  useEffect(() => {
    store.getState().syncFromNodes(nodesWithLayoutRef.current, layoutVariable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIdsKey, layoutVariable, store]);

  // Narrative shares Sociogram's full automatic-layout anneal (hot start + slow
  // cool so nodes escape local minima) and charge-driven spread; it additionally
  // applies group cohesion so same-group nodes cluster into their convex hulls.
  // The upward bias lifts the composition clear of the bottom-center preset
  // panel. Memoized so the layout does not re-seed on every render.
  //
  // charge/bias are now FIXED SIM-SPACE constants (the sim runs in px / canvas
  // height, coordinates ~0..aspect), so the layout SHAPE is screen-independent.
  // These are reasoned STARTING values for the new ~0..1.x coordinate scale and
  // need a visual tuning pass: the old px charge was -3000 at ~800px tall, which
  // does not translate linearly. Group-cohesion strength is internal to the
  // engine (shared across interfaces); supplying convexHullVariable below is
  // what switches it on. Tune visually.
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

  // Read-only but fully interactive layout. persist:false makes syncToRedux
  // unreachable, so a node's layoutVariable is never written — but the layout is
  // otherwise as interactive as the Sociogram's: it runs continuously (settling
  // then idling), dragging a node reheats it (via the simulation handlers wired
  // into the Canvas below), and the participant can pause/resume it from the
  // behaviours panel. It is driven by the SAME display-gated inputs the canvas
  // renders — convexHullVariable (groups) and filteredEdges (links) — so toggling
  // groups or links re-runs it to match: toggling groups re-seeds (cohesion
  // on/off), toggling links updates the edge force in place. Group cohesion is
  // inert when no groupVariable is set (getGroupKeys returns [] for every node).
  const layout = useAutoLayout({
    enabled: automaticLayoutEnabled && nodesWithLayout.length > 0,
    nodes: nodesWithLayout,
    edges: filteredEdges,
    store,
    nodeRadius: nodeWidth / 2,
    layoutVariable,
    groupVariable: convexHullVariable,
    persist: false,
    runMode: 'continuous',
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

  const background =
    stageBackground.image !== undefined ? (
      backgroundImage ? (
        <CanvasBackgroundImage src={backgroundImage} />
      ) : null
    ) : (
      <ConcentricCircles
        n={stageBackground.concentricCircles}
        skewed={stageBackground.skewedTowardCenter}
      />
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
        simulation={
          automaticLayoutEnabled
            ? { moveNode: layout.moveNode, releaseNode: layout.releaseNode }
            : null
        }
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
      <BehavioursPanel
        showLayoutToggle={automaticLayoutEnabled && nodesWithLayout.length > 0}
        simulationEnabled={layout.simulationEnabled}
        onToggleSimulation={layout.toggleSimulation}
        showDrawingControls={freeDraw}
        isDrawingEnabled={isDrawingEnabled}
        isFrozen={isFrozen}
        onToggleDrawing={handleToggleDrawing}
        onToggleFreeze={handleToggleFreeze}
        onReset={handleResetInteractions}
      />
    </div>
  );
};

export default Narrative;
