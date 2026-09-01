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
