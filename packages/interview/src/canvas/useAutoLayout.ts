// Shared canvas auto-layout hook.
//
// Drives the options-driven force worker (autoLayout.worker.ts) for both the
// Narrative interface (read-only, run-once, seeded refinement) and the Sociogram
// interface (user-toggleable continuous layout that persists on settle). The
// behaviour is selected per call via `persist` and `runMode`; the worker forces
// are selected via `layoutOptions`.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { useContractFlags } from '../contract/context';
import type { AppDispatch } from '../store/store';
import type { AutoLayoutForceOptions } from './autoLayout.worker';
// Workers are imported with `?worker&inline` so Vite emits a self-contained
// Worker constructor backed by an inlined blob URL. This sidesteps the
// absolute `/assets/<hash>.js` URLs that library-mode worker chunks emit
// (which non-Vite consumer bundlers like Turbopack can't resolve), at the
// cost of bundling the worker source into the main chunk.
import AutoLayoutWorker from './autoLayout.worker?worker&inline';
import AutoLayoutMockWorker from './autoLayout.worker.mock?worker&inline';
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
import type { CanvasStoreApi } from './useCanvasStore';

type SimLink = { source: number; target: number };

type SimNode = {
  nodeId: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
  groupKeys?: ReturnType<typeof getGroupKeys>;
};

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
  // 'once' runs and freezes, re-seeding only when inputs change (Narrative).
  // 'continuous' is user-toggleable and reheats on edge/node changes while
  // running (Sociogram). Default 'once'.
  runMode?: RunMode;
  // Mock-worker layout strategy used under e2e. Default 'identity'.
  mockLayout?: MockLayout;
  // Per-interface force overrides merged over the worker defaults.
  layoutOptions?: Partial<AutoLayoutForceOptions>;
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
  layoutOptions,
}: UseAutoLayoutOptions): UseAutoLayoutResult {
  const { isE2E } = useContractFlags();
  const workerRef = useRef<Worker | null>(null);
  // The seeded node→index map, captured so continuous-mode link updates resolve
  // edge endpoints against the same indices the worker was initialized with.
  const nodeIndexByIdRef = useRef<Map<string, number>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [simulationEnabled, setSimulationEnabled] = useState(true);

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

  // Stable key that only changes when nodes are added or removed.
  const nodeIdsKey = useMemo(
    () =>
      nodes
        .map((n) => n[entityPrimaryKeyProperty])
        .toSorted((a, b) => a.localeCompare(b))
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
        .toSorted((a, b) => a.localeCompare(b))
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
        .toSorted((a, b) => a.localeCompare(b))
        .join(','),
    [edges],
  );

  // In 'once' mode an edge change re-seeds the whole layout; in 'continuous'
  // mode edges are re-set in place (see the update_links effect), so the seeding
  // effect must NOT re-run on edge changes there.
  const seedEdgesKey = runMode === 'once' ? edgesKey : '';

  // Depend on a stable serialization of the force overrides, not the object
  // identity, so a caller passing an inline `layoutOptions` object does not
  // re-seed the layout on every render. The effect reads the latest object via
  // a ref keyed on this value.
  const layoutOptionsKey = useMemo(
    () => JSON.stringify(layoutOptions ?? {}),
    [layoutOptions],
  );
  const layoutOptionsRef = useRef(layoutOptions);
  layoutOptionsRef.current = layoutOptions;

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

  useEffect(() => {
    if (!enabled) return;
    // Defer until the canvas has been measured: seeding against a 0-size canvas
    // would map every node to the origin. The dims subscription re-runs this
    // effect once real dimensions arrive (and again on each resize).
    if (!hasUsableDimensions(dimensions)) return;

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
    // linkDistance recomputed from the live collide radius (see worker default):
    // set just below the collision floor (2*collideRadius) so links pull
    // connected nodes onto the floor — the closest spacing in the layout — while
    // charge spreads unconnected nodes beyond it. Tune visually.
    const linkDistance = 1.9 * collideRadius;
    // Bounds inset is keyed to FALLBACK_NODE_RADIUS (px) so it EXACTLY matches the
    // store clamp's fixed inset, then divided by height into sim units — that
    // equality is what makes the store clamp a no-op on settled positions.
    const boundsInset = edgeInsetForNode(FALLBACK_NODE_RADIUS) / dims.height;

    // In e2e tests, swap in a deterministic worker so visual snapshots aren't
    // sensitive to simulation randomness.
    const worker = isE2E ? new AutoLayoutMockWorker() : new AutoLayoutWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { type: msgType, nodes: simNodes } = event.data as {
        type: string;
        nodes: SimNode[];
      };

      if (msgType !== 'tick' && msgType !== 'end') return;

      const entries: [string, { x: number; y: number }][] = simNodes
        .filter((n) => n.nodeId)
        .map((n) => [n.nodeId, fromSim(n, dims)]);
      store.getState().setBatchPositions(entries);
      setIsRunning(msgType === 'tick');

      // Persist on settle ONLY when persistence was constructed (persist:true +
      // dispatch). Unreachable in the read-only (Narrative) configuration.
      if (msgType === 'end' && persistArgs) {
        store
          .getState()
          .syncToRedux(
            persistArgs.dispatch,
            layoutVariable,
            persistArgs.currentStep,
          );
      }
    };

    // Seed from the positions the store already holds, converting each
    // normalized position to sim space and attaching group membership so the
    // worker's cohesion force can bucket nodes.
    const currentNodes = nodesRef.current;
    const { positions } = store.getState();
    const simNodes: SimNode[] = currentNodes.map((node) => {
      const nodeId = node[entityPrimaryKeyProperty];
      const pos = positions.get(nodeId) ?? { x: 0.5, y: 0.5 };
      const sim = toSim(pos, dims);
      return {
        nodeId,
        x: sim.x,
        y: sim.y,
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
      options: {
        ...layoutOptionsRef.current,
        collideRadius,
        linkDistance,
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
    if (runMode === 'once' || simulationEnabled) {
      worker.postMessage({ type: 'start' });
    }

    return () => {
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
    layoutOptionsKey,
    persistArgs,
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
