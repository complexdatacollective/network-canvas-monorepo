'use client';

// Shared canvas auto-layout hook.
//
// Drives the shared force worker (autoLayout.worker.ts) for Narrative,
// Sociogram, and Network Composer. Lifecycle and persistence are selected per
// call via `persist` and `runMode`; every interface uses the canonical force
// profile owned by the worker.
//
// READ-ONLY guarantee (Narrative): persistence is gated behind `persist === true`
// AND a supplied `dispatch`. When `persist` is false the syncToRedux call is not
// even constructed, so no Narrative gesture or tick can ever write attributes.
//
// The simulation runs in an ISOTROPIC, SCREEN-NORMALISED space (px / canvas
// height; see layoutGeometry's toSim): the x-axis spans [0, aspect], the y-axis
// [0, 1], with the same scale on both axes, so collision stays circular while
// charge/centering — fixed in sim space — keep the layout SHAPE identical across
// canvas sizes. This hook owns the canvas dimensions (tracked in the store via a
// ResizeObserver), so it derives the sim-space distances (collide radius, link
// distance, bounds inset = the px values / height) and the sim extents and passes
// them to the worker. Positions are converted back to normalized 0-1 (fromSim)
// before they reach the store. The collision radius derives from `nodeRadius`,
// which the caller measures off-screen with `useNodeMeasurement` so it tracks the
// live node size.
import { type AnimationPlaybackControls, animate } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useShouldSkipAnimations } from '@codaco/fresco-ui/hooks/useSafeAnimate';
import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { useContractFlags } from '../contract/context';
import type { AppDispatch } from '../store/store';
import { compareCodeUnits } from '../utils/compareCodeUnits';
import {
  createAutoLayoutMockWorker,
  createAutoLayoutWorker,
} from './createAutoLayoutWorker.ts';
import { getGroupKeys } from './groupMembership';
import {
  type CanvasDimensions,
  collideRadiusForNode,
  edgeInsetForNode,
  FALLBACK_NODE_RADIUS,
  fromSim,
  hasUsableDimensions,
  toSim,
} from './layoutGeometry';
import { type CanvasStoreApi, isPosition } from './useCanvasStore';

type SimLink = { source: number; target: number };

type SimNode = {
  nodeId: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
  placed: boolean;
  groupKeys?: ReturnType<typeof getGroupKeys>;
};

const SETTLE_ANIMATION_SECONDS = 0.6;
const CANVAS_CENTRE = { x: 0.5, y: 0.5 };
// Normalized distance below which a settled node counts as not having moved.
const MOVED_THRESHOLD = 0.002;

/** Whether a node the worker reports has an id and a place to put it. */
const isPlacedSimNode = (node: unknown): node is SimNode =>
  typeof node === 'object' &&
  node !== null &&
  'nodeId' in node &&
  typeof node.nodeId === 'string' &&
  node.nodeId !== '' &&
  'x' in node &&
  typeof node.x === 'number' &&
  'y' in node &&
  typeof node.y === 'number';

type MockLayout = 'identity' | 'grid';
type RunMode = 'once' | 'continuous';

type UseAutoLayoutOptions = {
  enabled: boolean;
  nodes: NcNode[];
  edges: NcEdge[];
  store: CanvasStoreApi;
  // The rendered node radius (px), measured off-screen via `useNodeMeasurement`
  // so collision matches the live node size. <= 0 falls back to the base radius;
  // the seeding effect re-runs once a real measurement arrives.
  nodeRadius: number;
  // Re-seed trigger; also the persistence target attribute when `persist`.
  layoutVariable: string;
  // Cohesion key. Empty/undefined disables cohesion (every node's groupKeys is
  // empty, so the force is inert) — the Sociogram case.
  groupVariable?: string;
  // When true, write settled positions back to Redux on `end`. Requires
  // `dispatch` and `currentStep`. Default false keeps the layout read-only.
  persist?: boolean;
  dispatch?: AppDispatch;
  currentStep?: number;
  // 'once' runs and freezes, re-seeding only when inputs change.
  // 'continuous' is user-toggleable and reheats on edge/node changes while
  // running. Default 'once'.
  runMode?: RunMode;
  // Mock-worker layout strategy used under e2e. Default 'identity'.
  mockLayout?: MockLayout;
};

type UseAutoLayoutResult = {
  isRunning: boolean;
  moveNode: (nodeId: string, normalizedPos: { x: number; y: number }) => void;
  releaseNode: (nodeId: string) => void;
  start: () => void;
  stop: () => void;
  reheat: () => void;
  simulationEnabled: boolean;
  toggleSimulation: () => void;
};

export function useAutoLayout({
  enabled,
  nodes,
  edges,
  store,
  nodeRadius,
  layoutVariable,
  groupVariable = '',
  persist = false,
  dispatch,
  currentStep,
  runMode = 'once',
  mockLayout = 'identity',
}: UseAutoLayoutOptions): UseAutoLayoutResult {
  const { isE2E } = useContractFlags();
  const workerRef = useRef<Worker | null>(null);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);
  const skipAnimations = useShouldSkipAnimations();
  const skipAnimationsRef = useRef(skipAnimations);
  skipAnimationsRef.current = skipAnimations;
  // The seeded node→index map, captured so continuous-mode link updates resolve
  // edge endpoints against the same indices the worker was initialized with,
  // and so a node added later is laid out as new even when its host gave it a
  // starting position.
  const nodeIndexByIdRef = useRef<Map<string, number>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const frameRef = useRef<number | null>(null);
  // Whether the canvas has shown people since it mounted. Until it has, a
  // layout is computed out of sight and revealed, so nobody is seen moving.
  const shownRef = useRef(false);
  // People being dragged. The drag places them, so the layout leaves them be.
  const heldRef = useRef(new Set<string>());

  // Keep refs updated so the effect can read latest values without re-running.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Persistence is only ever constructed when explicitly enabled AND a dispatch
  // is supplied. When read-only this resolves to null, so the `end` handler
  // below cannot reach syncToRedux.
  const persistArgs = useMemo(
    () =>
      persist && dispatch !== undefined && currentStep !== undefined
        ? { dispatch, currentStep }
        : null,
    [persist, dispatch, currentStep],
  );
  // Read when a layout run starts rather than being a reason to start one:
  // moving to the next step changes it while this stage is still on screen
  // for its exit transition, and the layout must not change or save then.
  const persistArgsRef = useRef(persistArgs);
  persistArgsRef.current = persistArgs;

  // Stable key that only changes when nodes are added or removed.
  const nodeIdsKey = useMemo(
    () =>
      nodes
        .map((n) => n[entityPrimaryKeyProperty])
        .toSorted(compareCodeUnits)
        .join(','),
    [nodes],
  );

  // Stable key that changes when any node's group membership changes, so a
  // membership edit re-seeds the cohesion buckets even when the node set is
  // unchanged.
  const groupMembershipKey = useMemo(
    () =>
      nodes
        .map((node) =>
          JSON.stringify([
            node[entityPrimaryKeyProperty],
            getGroupKeys(node, groupVariable),
          ]),
        )
        .toSorted(compareCodeUnits)
        .join(','),
    [nodes, groupVariable],
  );

  // Stable key that only changes when the edge set changes.
  const edgesKey = useMemo(
    () =>
      edges
        .map(
          (e) => `${e[edgeSourceProperty]}-${e[edgeTargetProperty]}-${e.type}`,
        )
        .toSorted(compareCodeUnits)
        .join(','),
    [edges],
  );

  // In 'once' mode an edge change re-seeds the whole layout; in 'continuous'
  // mode edges are re-set in place (see the update_links effect), so the seeding
  // effect must NOT re-run on edge changes there.
  const seedEdgesKey = runMode === 'once' ? edgesKey : '';

  // Track the canvas dimensions so the simulation can (re-)seed in px and re-run
  // when the canvas resizes.
  const [dimensions, setDimensions] = useState<CanvasDimensions | null>(
    () => store.getState().canvasDimensions,
  );

  useEffect(() => {
    setDimensions(store.getState().canvasDimensions);
    return store.subscribe(
      (state) => state.canvasDimensions,
      (dims) => setDimensions(dims),
    );
  }, [store]);

  // Push the measured radius into the store so its boundary clamp insets by
  // the SAME radius the worker's bounds force uses (the seeding effect below
  // resolves <= 0 to the fallback exactly as the store does). Runs even when
  // the layout is disabled (e.g. manual-mode Sociogram) so plain drags clamp
  // against the real rendered radius too. Declared before the seeding effect
  // so a radius change re-clamps stored positions before the worker re-seeds
  // from them.
  useEffect(() => {
    store.getState().setNodeRadius(nodeRadius);
  }, [store, nodeRadius]);

  // The canvas is measured, and its first layout started, only after its first
  // paint. Hide people from that paint when a layout is about to move them.
  useLayoutEffect(() => {
    const starting = runMode === 'once' || simulationEnabled;
    const moving = nodesRef.current.some(
      (node) =>
        !persistArgsRef.current ||
        !isPosition(node[entityAttributesProperty][layoutVariable]),
    );
    if (enabled && starting && moving) {
      store.getState().setLayoutPending(true);
    }
    // Only the first paint; each run then sets whether it is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) {
      nodeIndexByIdRef.current = new Map();
      shownRef.current = true;
      store.getState().setLayoutPending(false);
      return undefined;
    }
    // Defer until the canvas has been measured: seeding against a 0-size canvas
    // would map every node to the origin. The dims subscription re-runs this
    // effect once real dimensions arrive (and again on each resize).
    if (!hasUsableDimensions(dimensions)) return undefined;

    const dims = dimensions;
    // nodeRadius is 0 until the off-screen measurement lands; fall back to the
    // base radius so the first pass still spaces nodes, then re-seed when the
    // real measurement arrives (nodeRadius is in this effect's deps).
    const resolvedRadius = nodeRadius > 0 ? nodeRadius : FALLBACK_NODE_RADIUS;
    // px-derived distances become SIM-space distances by dividing by the canvas
    // height (the sim space is px / H). The sim x-axis spans [0, aspect = W/H],
    // the y-axis [0, 1]. These shrink in sim units as the canvas grows, giving
    // larger screens proportionally more breathing room (FIX 1).
    const aspect = dims.width / dims.height;
    const collideRadius = collideRadiusForNode(resolvedRadius) / dims.height;
    // Bounds inset is keyed to the SAME resolved radius the setNodeRadius
    // effect above pushed into the store's clamp, then divided by height into
    // sim units — that equality is what makes the store clamp a no-op on
    // settled positions.
    const boundsInset = edgeInsetForNode(resolvedRadius) / dims.height;

    // In e2e tests, swap in a deterministic worker so visual snapshots aren't
    // sensitive to simulation randomness.
    const worker = isE2E
      ? createAutoLayoutMockWorker()
      : createAutoLayoutWorker();
    workerRef.current = worker;

    const cancelPlayback = () => {
      animationRef.current?.stop();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };

    // A message the worker sent before it was terminated can still arrive.
    // The layout it reports is no longer this run's to show or save: saving
    // it could overwrite positions put back after the layout was turned off.
    let disposed = false;
    // The step this stage was shown at, which settled positions are saved to.
    const persistTo = persistArgsRef.current;
    // Whether this run is the first the canvas shows and moves people, which
    // it reveals once it arrives instead of showing it being computed.
    let revealing = false;

    worker.addEventListener('message', (event: MessageEvent) => {
      if (disposed) return;
      const message: unknown = event.data;
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        !('nodes' in message) ||
        (message.type !== 'tick' && message.type !== 'end') ||
        !Array.isArray(message.nodes)
      ) {
        return;
      }
      const msgType = message.type;

      const held = heldRef.current;
      const entries: [string, { x: number; y: number }][] = message.nodes
        .filter(isPlacedSimNode)
        .filter((n) => !held.has(n.nodeId))
        .map((n) => [n.nodeId, fromSim(n, dims)]);
      cancelPlayback();

      // The layout settling while someone is still held is part of the drag:
      // it is shown as it runs, and saved once they are let go.
      if (msgType === 'tick' || held.size > 0) {
        store.getState().setBatchPositions(entries);
        setIsRunning(true);
        return;
      }

      // Persist on settle ONLY when persistence was constructed (persist:true +
      // dispatch). Unreachable in the read-only (Narrative) configuration. The
      // settled positions are saved before they are animated into place.
      if (persistTo) {
        store
          .getState()
          .syncToRedux(
            persistTo.dispatch,
            layoutVariable,
            persistTo.currentStep,
            new Map(entries),
          );
      }

      const from = store.getState().positions;
      const moved = entries.some(([nodeId, to]) => {
        const start = from.get(nodeId);
        return (
          !start ||
          Math.abs(start.x - to.x) > MOVED_THRESHOLD ||
          Math.abs(start.y - to.y) > MOVED_THRESHOLD
        );
      });

      if (revealing || !moved || skipAnimationsRef.current) {
        if (revealing) store.getState().revealLayout(entries);
        else store.getState().setBatchPositions(entries);
        revealing = false;
        shownRef.current = true;
        // A run that is not animated is still reported, a frame later so its
        // start is observed.
        setIsRunning(moved);
        if (moved) {
          frameRef.current = requestAnimationFrame(() => setIsRunning(false));
        }
        return;
      }

      setIsRunning(true);
      // Everyone moves in a straight line from where they are shown to where
      // the layout settled; someone just added appears in place.
      animationRef.current = animate(0, 1, {
        duration: SETTLE_ANIMATION_SECONDS,
        ease: [0.33, 1, 0.68, 1],
        onUpdate: (progress) => {
          store.getState().setBatchPositions(
            entries.map(([nodeId, to]) => {
              const start = from.get(nodeId) ?? to;
              return [
                nodeId,
                {
                  x: start.x + (to.x - start.x) * progress,
                  y: start.y + (to.y - start.y) * progress,
                },
              ];
            }),
          );
        },
        onComplete: () => setIsRunning(false),
      });
    });

    // Seed from the positions the store already holds, converting each
    // normalized position to sim space and attaching group membership so the
    // worker's cohesion force can bucket nodes.
    const currentNodes = nodesRef.current;
    const { positions } = store.getState();
    const previousIds = nodeIndexByIdRef.current;
    const nodesChanged =
      previousIds.size > 0 &&
      (previousIds.size !== currentNodes.length ||
        currentNodes.some(
          (node) => !previousIds.has(node[entityPrimaryKeyProperty]),
        ));
    const simNodes: SimNode[] = currentNodes.map((node) => {
      const nodeId = node[entityPrimaryKeyProperty];
      const pos = positions.get(nodeId);
      const sim = toSim(pos ?? CANVAS_CENTRE, dims);
      return {
        nodeId,
        x: sim.x,
        y: sim.y,
        placed:
          pos !== undefined &&
          (previousIds.size === 0 || previousIds.has(nodeId)),
        groupKeys: getGroupKeys(node, groupVariable),
      };
    });

    // Build link endpoints as INDICES into simNodes (d3 forceLink's index form),
    // including only edges whose both endpoints are present in the seeded set.
    const indexById = new Map(
      simNodes.map((simNode, index) => [simNode.nodeId, index]),
    );
    nodeIndexByIdRef.current = indexById;
    const simLinks: SimLink[] = [];
    for (const edge of edgesRef.current) {
      const source = indexById.get(edge[edgeSourceProperty]);
      const target = indexById.get(edge[edgeTargetProperty]);
      if (source === undefined || target === undefined) continue;
      simLinks.push({ source, target });
    }

    worker.postMessage({
      type: 'initialize',
      nodes: simNodes,
      links: simLinks,
      paused: runMode === 'continuous' && !simulationEnabled,
      incremental: nodesChanged,
      // Saved positions are this layout's own, so people keep them.
      keepPlaced: persistTo !== null,
      options: {
        collideRadius,
        boundsInset,
        // Sim extents: the worker resolves the forceX/forceY targets and the
        // bounds box from these (sim x spans [0, simWidth = aspect], y spans
        // [0, simHeight = 1]); the mock grid also spans them.
        simWidth: aspect,
        simHeight: 1,
        mockLayout,
      },
    });

    // 'once' runs immediately and settles. 'continuous' starts only when the
    // user has the simulation enabled; the start/stop effect below also reacts
    // to toggles.
    const starting = runMode === 'once' || simulationEnabled;
    // A layout that keeps saved positions moves only the people it places.
    revealing =
      starting &&
      !shownRef.current &&
      simNodes.some((simNode) => !simNode.placed || !persistTo);
    // A canvas that shows its people without laying them out first has shown
    // them, so later runs move them into place instead.
    if (!revealing) shownRef.current = true;
    store.getState().setLayoutPending(revealing);
    if (starting) {
      worker.postMessage({ type: 'start' });
    }

    return () => {
      disposed = true;
      cancelPlayback();
      setIsRunning(false);
      worker.terminate();
      workerRef.current = null;
    };
    // Re-seed + restart when node structure, edges, the active group/layout
    // variable, the measured node size, or the canvas size changes. In
    // continuous mode, edge changes reheat via the dedicated effect below rather
    // than re-seeding, so edgesKey is intentionally excluded there.
    // simulationEnabled intentionally omitted from deps: the continuous
    // start/stop effect handles toggles, so re-seeding does not occur on every
    // pause/resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    isE2E,
    nodeIdsKey,
    seedEdgesKey,
    groupMembershipKey,
    layoutVariable,
    nodeRadius,
    runMode,
    mockLayout,
    store,
    dimensions,
  ]);

  // Continuous mode: re-set links in the existing worker when edges change,
  // reheating only if running (mirrors the worker's `running` guard).
  useEffect(() => {
    if (runMode !== 'continuous') return;
    const worker = workerRef.current;
    if (!worker || !enabled) return;

    const indexById = nodeIndexByIdRef.current;
    const simLinks: SimLink[] = [];
    for (const edge of edgesRef.current) {
      const source = indexById.get(edge[edgeSourceProperty]);
      const target = indexById.get(edge[edgeTargetProperty]);
      if (source === undefined || target === undefined) continue;
      simLinks.push({ source, target });
    }

    worker.postMessage({ type: 'update_links', links: simLinks });
  }, [runMode, enabled, edgesKey]);

  // Continuous mode: start/stop the worker when the user toggles the layout.
  useEffect(() => {
    if (runMode !== 'continuous') return;
    if (!workerRef.current || !enabled) return;

    if (simulationEnabled) {
      workerRef.current.postMessage({ type: 'start' });
    } else {
      workerRef.current.postMessage({ type: 'stop' });
    }
  }, [runMode, simulationEnabled, enabled]);

  const start = useCallback(() => {
    workerRef.current?.postMessage({ type: 'start' });
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' });
  }, []);

  const reheat = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reheat' });
  }, []);

  const moveNode = useCallback(
    (nodeId: string, normalizedPos: { x: number; y: number }) => {
      if (!workerRef.current) return;
      const dims = store.getState().canvasDimensions;
      if (!hasUsableDimensions(dims)) return;
      heldRef.current.add(nodeId);
      const sim = toSim(normalizedPos, dims);
      workerRef.current.postMessage({
        type: 'update_node',
        nodeId,
        node: { fx: sim.x, fy: sim.y },
      });
    },
    [store],
  );

  const releaseNode = useCallback((nodeId: string) => {
    heldRef.current.delete(nodeId);
    if (!workerRef.current) return;
    workerRef.current.postMessage({
      type: 'update_node',
      nodeId,
      node: { fx: null, fy: null },
    });
  }, []);

  const toggleSimulation = useCallback(() => {
    setSimulationEnabled((prev) => !prev);
  }, []);

  return {
    isRunning,
    moveNode,
    releaseNode,
    start,
    stop,
    reheat,
    simulationEnabled,
    toggleSimulation,
  };
}
