import type { Simulation } from 'd3-force';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VariableOptionValue } from '@codaco/protocol-validation';

import { collideRadiusForNode } from '../layoutGeometry';

// The shared auto-layout worker drives a REAL d3-force simulation (unlike the
// legacy Sociogram worker test, which mocks d3-force). We spy on
// `forceSimulation` to capture the live simulation instance the worker creates,
// then stop its internal timer and drive `simulation.tick()` manually so
// convergence is deterministic and synchronous. The worker only communicates via
// `postMessage`, which we stub to capture emitted payloads.

type CapturedSim = Simulation<SimNode, undefined>;
type SimNode = {
  nodeId?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  groupKeys?: VariableOptionValue[];
};

let capturedSim: CapturedSim | null = null;

vi.mock('d3-force', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3-force')>();
  return {
    ...actual,
    forceSimulation: vi.fn(
      (...args: Parameters<typeof actual.forceSimulation>) => {
        const sim = actual.forceSimulation(...args);
        capturedSim = sim as CapturedSim;
        return sim;
      },
    ),
  };
});

// Imported after the mock is registered.
const { handleMessage } = await import('../autoLayout.worker');

type PostedMessage = { type: string; nodes: SimNode[] };
let posted: PostedMessage[];

// Drive the simulation deterministically: stop the d3-timer the worker's
// `restart()` started, then tick manually and replay the worker's tick handler
// so positions propagate via the same `postMessage` path the worker uses.
const tickManually = (count: number) => {
  if (!capturedSim) throw new Error('simulation not captured');
  capturedSim.stop();
  for (let i = 0; i < count; i += 1) {
    capturedSim.tick();
    // Mirror the worker's on('tick') emission for payload-shape assertions.
    postMessage({ type: 'tick', nodes: capturedSim.nodes() });
  }
};

const meanPairwiseDistance = (nodes: SimNode[]): number => {
  if (nodes.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = (nodes[i]!.x ?? 0) - (nodes[j]!.x ?? 0);
      const dy = (nodes[i]!.y ?? 0) - (nodes[j]!.y ?? 0);
      total += Math.hypot(dx, dy);
      pairs += 1;
    }
  }
  return total / pairs;
};

const minPairwiseDistance = (nodes: SimNode[]): number => {
  let min = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = (nodes[i]!.x ?? 0) - (nodes[j]!.x ?? 0);
      const dy = (nodes[i]!.y ?? 0) - (nodes[j]!.y ?? 0);
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return min;
};

// Group members start spread well beyond the collision floor (~154px
// center-to-center for a 48px-radius node) so cohesion has room to demonstrably
// tighten each group without fighting collision. Groups A and B sit far apart.
const TWO_GROUPS: SimNode[] = [
  { nodeId: 'a1', x: -900, y: 0, groupKeys: ['A'] },
  { nodeId: 'a2', x: -700, y: 400, groupKeys: ['A'] },
  { nodeId: 'a3', x: -500, y: -400, groupKeys: ['A'] },
  { nodeId: 'b1', x: 900, y: 0, groupKeys: ['B'] },
  { nodeId: 'b2', x: 700, y: 400, groupKeys: ['B'] },
  { nodeId: 'b3', x: 500, y: -400, groupKeys: ['B'] },
];

const cloneNodes = (nodes: SimNode[]): SimNode[] =>
  nodes.map((node) => ({ ...node, groupKeys: node.groupKeys?.slice() }));

beforeEach(() => {
  posted = [];
  capturedSim = null;
  vi.stubGlobal(
    'postMessage',
    vi.fn((message: PostedMessage) => {
      posted.push(message);
    }),
  );
});

afterEach(() => {
  capturedSim?.stop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('autoLayout worker', () => {
  it('registers the group force on initialize and does not auto-run', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    expect(capturedSim).not.toBeNull();
    // A registered 'group' force is what makes this a cohesion simulation.
    expect(capturedSim!.force('group')).toBeTruthy();
    // No tick is emitted before `start` — initialize ends with alpha(0).stop().
    expect(posted.some((m) => m.type === 'tick')).toBe(false);
  });

  it('pulls same-group nodes closer together after start', () => {
    const nodes = cloneNodes(TWO_GROUPS);
    handleMessage({ type: 'initialize', nodes });

    const groupABefore = meanPairwiseDistance(
      nodes.filter((n) => n.groupKeys?.includes('A')),
    );
    const groupBBefore = meanPairwiseDistance(
      nodes.filter((n) => n.groupKeys?.includes('B')),
    );

    handleMessage({ type: 'start' });
    tickManually(150);

    const settled = capturedSim!.nodes();
    const groupAAfter = meanPairwiseDistance(
      settled.filter((n) => n.groupKeys?.includes('A')),
    );
    const groupBAfter = meanPairwiseDistance(
      settled.filter((n) => n.groupKeys?.includes('B')),
    );

    expect(groupAAfter).toBeLessThan(groupABefore);
    expect(groupBAfter).toBeLessThan(groupBBefore);
  });

  it('starts gently (alpha <= 0.4), refining rather than fully reheating', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    handleMessage({ type: 'start' });

    // Gentle start: alpha set to startAlpha (0.4), NOT alpha(1).
    expect(capturedSim!.alpha()).toBeLessThanOrEqual(0.4);
    expect(capturedSim!.alpha()).toBeGreaterThan(0);
  });

  it('pins a node on update_node {fx,fy} and releases it on {fx:null,fy:null}', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    handleMessage({
      type: 'update_node',
      nodeId: 'a1',
      node: { fx: 5, fy: 7 },
    });

    const pinned = capturedSim!.nodes().find((n) => n.nodeId === 'a1');
    expect(pinned?.fx).toBe(5);
    expect(pinned?.fy).toBe(7);

    handleMessage({
      type: 'update_node',
      nodeId: 'a1',
      node: { fx: null, fy: null },
    });

    const released = capturedSim!.nodes().find((n) => n.nodeId === 'a1');
    expect(released?.fx).toBeNull();
    expect(released?.fy).toBeNull();
    // Snap-on-clear: x/y inherit the previously fixed coordinates.
    expect(released?.x).toBe(5);
    expect(released?.y).toBe(7);
  });

  it('emits an end message on stop', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    handleMessage({ type: 'stop' });

    expect(posted.some((m) => m.type === 'end')).toBe(true);
  });

  it('update_links re-sets the link force and reheats only while running', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    // Paused (no start yet): adding links must NOT reheat the simulation.
    handleMessage({
      type: 'update_links',
      links: [{ source: 0, target: 3 }],
    });
    const linkForcePaused = capturedSim!.force('link');
    expect(linkForcePaused).toBeTruthy();
    // alpha stays at the seeded 0 because the worker is not running.
    expect(capturedSim!.alpha()).toBe(0);

    // Running: re-setting links must reheat (alpha rises above the alphaMin floor).
    handleMessage({ type: 'start' });
    capturedSim!.stop(); // halt the d3 timer so alpha doesn't decay before we read it
    handleMessage({
      type: 'update_links',
      links: [
        { source: 0, target: 3 },
        { source: 1, target: 4 },
      ],
    });
    expect(capturedSim!.force('link')).toBeTruthy();
    expect(capturedSim!.alpha()).toBeGreaterThan(capturedSim!.alphaMin());
  });

  it('is deterministic: same seed and messages produce identical positions', () => {
    const runOnce = () => {
      capturedSim = null;
      posted = [];
      handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });
      handleMessage({ type: 'start' });
      tickManually(80);
      return capturedSim!.nodes().map((n) => ({ x: n.x, y: n.y }));
    };

    const first = runOnce();
    const second = runOnce();

    expect(first).toEqual(second);
  });

  it('pulls two connected nodes closer (forceLink) but not past the collision floor', () => {
    // Two nodes, NO shared group, seeded far apart and linked by one edge. The
    // link force must pull them together; collision must still floor the gap so
    // they never overlap. Collision floor for a 48px-radius node is
    // 2 * collideRadiusForNode(48) = 168px.
    const NODE_RADIUS = 48;
    const COLLIDE_RADIUS = collideRadiusForNode(NODE_RADIUS);
    const MIN_CENTER_TO_CENTER = 2 * COLLIDE_RADIUS;
    const TOLERANCE = 0.04;

    const nodes: SimNode[] = [
      { nodeId: 'p', x: -900, y: 0 },
      { nodeId: 'q', x: 900, y: 0 },
    ];
    const seedDistance = minPairwiseDistance(nodes);

    handleMessage({
      type: 'initialize',
      nodes,
      links: [{ source: 0, target: 1 }],
      options: { collideRadius: COLLIDE_RADIUS },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    const settledDistance = minPairwiseDistance(settled);

    // Links pulled them together...
    expect(settledDistance).toBeLessThan(seedDistance);
    // ...but collision floored the gap (they did not overlap).
    expect(settledDistance).toBeGreaterThanOrEqual(
      MIN_CENTER_TO_CENTER * (1 - TOLERANCE),
    );
  });

  it('biases the composition upward (forceY) so it clears the bottom panel', () => {
    // Nodes seeded centered and low on a 900px-tall canvas. The weak upward
    // forceY (target 0.4 * height = 360px) must lift their mean y above (smaller
    // than) the seed mean, while staying within canvas bounds. biasYStrength is
    // 0 by default (Sociogram needs no upward bias), so the Narrative tuning that
    // enables it is supplied explicitly here.
    const HEIGHT = 900;
    const NODE_RADIUS = 48;
    const COLLIDE_RADIUS = collideRadiusForNode(NODE_RADIUS);

    const nodes: SimNode[] = [
      { nodeId: 'n0', x: 760, y: 600 },
      { nodeId: 'n1', x: 800, y: 640 },
      { nodeId: 'n2', x: 840, y: 680 },
      { nodeId: 'n3', x: 720, y: 660 },
    ];
    const seedMeanY =
      nodes.reduce((sum, n) => sum + (n.y ?? 0), 0) / nodes.length;

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: COLLIDE_RADIUS,
        canvasHeight: HEIGHT,
        biasYStrength: 0.04,
        biasYFraction: 0.4,
      },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    const settledMeanY =
      settled.reduce((sum, n) => sum + (n.y ?? 0), 0) / settled.length;

    // Biased upward: mean y dropped toward the above-center target.
    expect(settledMeanY).toBeLessThan(seedMeanY);
    // Still within the canvas height (not flung off the top).
    for (const node of settled) {
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it('registers forceManyBody and spreads disconnected nodes farther with a negative charge', () => {
    // Sociogram supplies a negative charge for repulsion (no group cohesion to
    // drive spread). With charge:0 only collision acts; a negative charge must
    // register forceManyBody and push disconnected nodes demonstrably farther
    // apart. Seed five unlinked, ungrouped nodes clustered near the origin.
    const seed = (): SimNode[] =>
      Array.from({ length: 5 }, (_, i) => ({
        nodeId: `n${i}`,
        x: (i % 3) * 4,
        y: Math.floor(i / 3) * 4,
      }));

    const settle = (charge: number) => {
      capturedSim = null;
      posted = [];
      handleMessage({
        type: 'initialize',
        nodes: seed(),
        options: { charge },
      });
      handleMessage({ type: 'start' });
      tickManually(300);
      return capturedSim!;
    };

    // charge:0 — forceManyBody is not registered.
    const noCharge = settle(0);
    expect(noCharge.force('charge')).toBeFalsy();
    const spreadNoCharge = meanPairwiseDistance(noCharge.nodes());

    // charge:negative — forceManyBody is registered and spreads nodes farther.
    const repelled = settle(-2000);
    expect(repelled.force('charge')).toBeTruthy();
    const spreadRepelled = meanPairwiseDistance(repelled.nodes());

    expect(spreadRepelled).toBeGreaterThan(spreadNoCharge);
  });

  it('biases the composition horizontally (forceX) toward the target', () => {
    // Mirror of the biasY test: nodes seeded off-center to the left on a 1600px-
    // wide canvas. The weak horizontal forceX (target 0.5 * width = 800px) must
    // pull their mean x toward center (larger than the seed mean), staying within
    // canvas bounds. biasXStrength is 0 by default (Narrative preserves authored
    // x), so the Sociogram tuning that enables it is supplied explicitly here.
    const WIDTH = 1600;
    const NODE_RADIUS = 48;
    const COLLIDE_RADIUS = collideRadiusForNode(NODE_RADIUS);

    const nodes: SimNode[] = [
      { nodeId: 'n0', x: 200, y: 400 },
      { nodeId: 'n1', x: 240, y: 440 },
      { nodeId: 'n2', x: 280, y: 480 },
      { nodeId: 'n3', x: 160, y: 460 },
    ];
    const seedMeanX =
      nodes.reduce((sum, n) => sum + (n.x ?? 0), 0) / nodes.length;

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: COLLIDE_RADIUS,
        canvasWidth: WIDTH,
        biasXStrength: 0.05,
        biasXFraction: 0.5,
      },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    const settledMeanX =
      settled.reduce((sum, n) => sum + (n.x ?? 0), 0) / settled.length;

    // Biased toward center: mean x rose toward the 800px target.
    expect(settledMeanX).toBeGreaterThan(seedMeanX);
    // Still within the canvas width (not flung off the right).
    for (const node of settled) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(WIDTH);
    }
  });

  it('only ever posts {type, nodes} payloads with no persistence-shaped fields', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });
    handleMessage({ type: 'start' });
    tickManually(20);
    handleMessage({ type: 'stop' });

    expect(posted.length).toBeGreaterThan(0);
    for (const message of posted) {
      expect(Object.keys(message).toSorted()).toEqual(['nodes', 'type']);
      expect(['tick', 'end']).toContain(message.type);
      expect(Array.isArray(message.nodes)).toBe(true);
      for (const node of message.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
      }
    }
  });
});

describe('autoLayout worker — pixel-space spacing guarantee', () => {
  // The hook seeds in PIXEL coordinates on a non-square canvas. Collision must
  // enforce the minimum gap isotropically (the same px on both axes), so the
  // settled minimum center-to-center distance is >= 2 * collideRadius
  // regardless of aspect ratio.
  const NODE_RADIUS = 48;
  const COLLIDE_RADIUS = collideRadiusForNode(NODE_RADIUS);
  const MIN_CENTER_TO_CENTER = 2 * COLLIDE_RADIUS;
  // d3-force's forceCollide leaves a small residual overlap even at strength(1);
  // allow a modest tolerance below the theoretical minimum.
  const TOLERANCE = 0.04; // 4%

  // A wide 16:9 canvas — the case where normalized-space collision would
  // collapse the vertical gap into a flattened ellipse.
  const WIDTH = 1600;
  const HEIGHT = 900;

  const px = (xNorm: number, yNorm: number) => ({
    x: xNorm * WIDTH,
    y: yNorm * HEIGHT,
  });

  // The worker itself applies no bounding force (the store clamps to the canvas
  // in the real pipeline). Here we assert the layout stays finite and bounded
  // near the seeded region rather than flying off — collision spreads nodes by
  // at most a few node-widths from the cluster centre.
  const assertBounded = (nodes: SimNode[]) => {
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Math.abs(node.x ?? 0)).toBeLessThan(WIDTH * 2);
      expect(Math.abs(node.y ?? 0)).toBeLessThan(HEIGHT * 2 + WIDTH);
    }
  };

  it('separates overlapping ungrouped nodes to the enforced minimum (no clustering)', () => {
    // Six nodes seeded almost on top of each other near the canvas centre, with
    // NO group keys: collision alone must push them apart to the minimum gap.
    const center = px(0.5, 0.5);
    const nodes: SimNode[] = Array.from({ length: 6 }, (_, i) => ({
      nodeId: `n${i}`,
      x: center.x + (i % 3),
      y: center.y + Math.floor(i / 3),
    }));

    handleMessage({
      type: 'initialize',
      nodes,
      options: { collideRadius: COLLIDE_RADIUS },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    expect(minPairwiseDistance(settled)).toBeGreaterThanOrEqual(
      MIN_CENTER_TO_CENTER * (1 - TOLERANCE),
    );
    assertBounded(settled);
  });

  it('enforces the minimum gap within a tightly clustered grouped seed', () => {
    // A single group of nodes seeded clustered tightly together (the worst case
    // for cohesion + collision fighting). Collision must still hold the gap.
    const center = px(0.5, 0.5);
    const nodes: SimNode[] = Array.from({ length: 8 }, (_, i) => ({
      nodeId: `g${i}`,
      x: center.x + (i % 4) * 2,
      y: center.y + Math.floor(i / 4) * 2,
      groupKeys: ['A'],
    }));

    handleMessage({
      type: 'initialize',
      nodes,
      options: { collideRadius: COLLIDE_RADIUS },
    });
    handleMessage({ type: 'start' });
    tickManually(400);

    const settled = capturedSim!.nodes();
    expect(minPairwiseDistance(settled)).toBeGreaterThanOrEqual(
      MIN_CENTER_TO_CENTER * (1 - TOLERANCE),
    );
    assertBounded(settled);
  });

  it('holds the gap on both axes on a non-square canvas (isotropic in px)', () => {
    // Nodes seeded in a vertical stack a few px apart. In normalized space this
    // gap would survive on the short (height) axis but collapse visually; in px
    // space collision enforces the same minimum regardless of axis.
    const x = px(0.5, 0).x;
    const nodes: SimNode[] = Array.from({ length: 5 }, (_, i) => ({
      nodeId: `v${i}`,
      x,
      y: HEIGHT * 0.5 + i * 3,
    }));

    handleMessage({
      type: 'initialize',
      nodes,
      options: { collideRadius: COLLIDE_RADIUS },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    expect(minPairwiseDistance(settled)).toBeGreaterThanOrEqual(
      MIN_CENTER_TO_CENTER * (1 - TOLERANCE),
    );
    assertBounded(settled);
  });

  it('confines nodes within the bounds inset while still preventing overlap', () => {
    // The store clamps each node independently AFTER collision, so an upward
    // bias that drives a group to the top edge would project several separated
    // nodes onto the same boundary line and re-introduce overlap. The worker's
    // post-collision bounds force solves this by confining strays to the wall in
    // the same pass collision separates them, so the settled layout is both
    // inside the inset box AND overlap-free against the wall.
    const INSET = 64;
    const maxX = WIDTH - INSET;
    const maxY = HEIGHT - INSET;

    // Seed nodes OUTSIDE the inset box (some past every edge) and overlapping, so
    // the bounds force must both pull them in and collision must keep them apart.
    const nodes: SimNode[] = [
      { nodeId: 'o0', x: -200, y: -150 },
      { nodeId: 'o1', x: -190, y: -140 },
      { nodeId: 'o2', x: WIDTH + 300, y: HEIGHT + 200 },
      { nodeId: 'o3', x: WIDTH + 290, y: HEIGHT + 210 },
      { nodeId: 'o4', x: WIDTH + 280, y: -120 },
      { nodeId: 'o5', x: -180, y: HEIGHT + 180 },
    ];

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: COLLIDE_RADIUS,
        boundsInset: INSET,
        canvasWidth: WIDTH,
        canvasHeight: HEIGHT,
      },
    });
    handleMessage({ type: 'start' });
    tickManually(400);

    const settled = capturedSim!.nodes();

    // Every node center is inside the inset box on both axes.
    for (const node of settled) {
      expect(node.x).toBeGreaterThanOrEqual(INSET);
      expect(node.x).toBeLessThanOrEqual(maxX);
      expect(node.y).toBeGreaterThanOrEqual(INSET);
      expect(node.y).toBeLessThanOrEqual(maxY);
    }

    // No overlap survives even against the wall.
    expect(minPairwiseDistance(settled)).toBeGreaterThanOrEqual(
      MIN_CENTER_TO_CENTER * (1 - TOLERANCE),
    );
  });
});
