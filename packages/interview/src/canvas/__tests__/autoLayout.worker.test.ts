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
//
// The simulation runs in ISOTROPIC, SCREEN-NORMALISED space (px / canvas height):
// the x-axis spans [0, aspect], the y-axis [0, 1]. Seeds and distances below are
// therefore sim-space quantities (a px length / a reference canvas height), not
// pixels. The reference height for the derived collide radius is HEIGHT below.

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

// Reference canvas height for converting px geometry to sim distances.
const HEIGHT = 900;
// Sim-space collide radius for a base 48px node on a HEIGHT-tall canvas.
const SIM_COLLIDE_RADIUS = collideRadiusForNode(48) / HEIGHT;

// Group members start spread well beyond the collision floor (~0.149 sim
// center-to-center for a 48px-radius node on a 900px canvas) so cohesion has room
// to demonstrably tighten each group without fighting collision. Groups A and B
// sit far apart (~±1 sim units, the full canvas width).
const TWO_GROUPS: SimNode[] = [
  { nodeId: 'a1', x: -1.0, y: 0, groupKeys: ['A'] },
  { nodeId: 'a2', x: -0.8, y: 0.44, groupKeys: ['A'] },
  { nodeId: 'a3', x: -0.6, y: -0.44, groupKeys: ['A'] },
  { nodeId: 'b1', x: 1.0, y: 0, groupKeys: ['B'] },
  { nodeId: 'b2', x: 0.8, y: 0.44, groupKeys: ['B'] },
  { nodeId: 'b3', x: 0.6, y: -0.44, groupKeys: ['B'] },
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
    handleMessage({
      type: 'initialize',
      nodes,
      options: { collideRadius: SIM_COLLIDE_RADIUS },
    });

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
      node: { fx: 0.5, fy: 0.7 },
    });

    const pinned = capturedSim!.nodes().find((n) => n.nodeId === 'a1');
    expect(pinned?.fx).toBe(0.5);
    expect(pinned?.fy).toBe(0.7);

    handleMessage({
      type: 'update_node',
      nodeId: 'a1',
      node: { fx: null, fy: null },
    });

    const released = capturedSim!.nodes().find((n) => n.nodeId === 'a1');
    expect(released?.fx).toBeNull();
    expect(released?.fy).toBeNull();
    // Snap-on-clear: x/y inherit the previously fixed coordinates.
    expect(released?.x).toBe(0.5);
    expect(released?.y).toBe(0.7);
  });

  it('emits an end message on stop', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    handleMessage({ type: 'stop' });

    expect(posted.some((m) => m.type === 'end')).toBe(true);
  });

  it('update_links re-sets the link force and reheats unless the layout is paused', () => {
    handleMessage({ type: 'initialize', nodes: cloneNodes(TWO_GROUPS) });

    // Paused (the user stopped the layout): adding links re-sets the link force
    // but must NOT reheat the simulation.
    handleMessage({ type: 'start' });
    handleMessage({ type: 'stop' });
    const alphaWhilePaused = capturedSim!.alpha();
    handleMessage({
      type: 'update_links',
      links: [{ source: 0, target: 3 }],
    });
    expect(capturedSim!.force('link')).toBeTruthy();
    expect(capturedSim!.alpha()).toBe(alphaWhilePaused);

    // Settled but not paused: adding links must reheat (alpha rises back above
    // the alphaMin floor) so the new edge re-runs the layout.
    handleMessage({ type: 'start' });
    capturedSim!.stop(); // halt the d3 timer; advance alpha by manual ticks only
    tickManually(600);
    const alphaSettled = capturedSim!.alpha();
    handleMessage({
      type: 'update_links',
      links: [
        { source: 0, target: 3 },
        { source: 1, target: 4 },
      ],
    });
    expect(capturedSim!.force('link')).toBeTruthy();
    expect(capturedSim!.alpha()).toBeGreaterThan(alphaSettled);
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
    // they never overlap. Collision floor (sim units) for a 48px-radius node on a
    // 900px canvas is 2 * SIM_COLLIDE_RADIUS.
    const MIN_CENTER_TO_CENTER = 2 * SIM_COLLIDE_RADIUS;
    const TOLERANCE = 0.04;

    const nodes: SimNode[] = [
      { nodeId: 'p', x: -1.0, y: 0 },
      { nodeId: 'q', x: 1.0, y: 0 },
    ];
    const seedDistance = minPairwiseDistance(nodes);

    handleMessage({
      type: 'initialize',
      nodes,
      links: [{ source: 0, target: 1 }],
      options: { collideRadius: SIM_COLLIDE_RADIUS },
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
    // Nodes seeded centered and low in a unit-tall sim space. The weak upward
    // forceY (target 0.4 * simHeight = 0.4) must lift their mean y above (smaller
    // than) the seed mean, while staying within sim bounds. biasYStrength is 0 by
    // default (Sociogram needs no upward bias), so the Narrative tuning that
    // enables it is supplied explicitly here.
    const nodes: SimNode[] = [
      { nodeId: 'n0', x: 0.85, y: 0.66 },
      { nodeId: 'n1', x: 0.9, y: 0.71 },
      { nodeId: 'n2', x: 0.95, y: 0.76 },
      { nodeId: 'n3', x: 0.8, y: 0.73 },
    ];
    const seedMeanY =
      nodes.reduce((sum, n) => sum + (n.y ?? 0), 0) / nodes.length;

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: SIM_COLLIDE_RADIUS,
        simHeight: 1,
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
    // Still finite and on-canvas (not flung off the top).
    for (const node of settled) {
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
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
        x: (i % 3) * 0.005,
        y: Math.floor(i / 3) * 0.005,
      }));

    const settle = (charge: number) => {
      capturedSim = null;
      posted = [];
      handleMessage({
        type: 'initialize',
        nodes: seed(),
        options: { charge, collideRadius: SIM_COLLIDE_RADIUS },
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
    const repelled = settle(-0.1);
    expect(repelled.force('charge')).toBeTruthy();
    const spreadRepelled = meanPairwiseDistance(repelled.nodes());

    expect(spreadRepelled).toBeGreaterThan(spreadNoCharge);
  });

  it('biases the composition horizontally (forceX) toward the target', () => {
    // Mirror of the biasY test: nodes seeded off-center to the left on a wide
    // canvas (aspect 16:9 -> simWidth ~1.78). The weak horizontal forceX (target
    // 0.5 * simWidth) must pull their mean x toward center (larger than the seed
    // mean), staying within sim bounds. biasXStrength is 0 by default (Narrative
    // preserves authored x), so the Sociogram tuning that enables it is supplied
    // explicitly here.
    const SIM_WIDTH = 1600 / 900;
    const nodes: SimNode[] = [
      { nodeId: 'n0', x: 0.22, y: 0.44 },
      { nodeId: 'n1', x: 0.27, y: 0.49 },
      { nodeId: 'n2', x: 0.31, y: 0.53 },
      { nodeId: 'n3', x: 0.18, y: 0.51 },
    ];
    const seedMeanX =
      nodes.reduce((sum, n) => sum + (n.x ?? 0), 0) / nodes.length;

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: SIM_COLLIDE_RADIUS,
        simWidth: SIM_WIDTH,
        biasXStrength: 0.05,
        biasXFraction: 0.5,
      },
    });
    handleMessage({ type: 'start' });
    tickManually(300);

    const settled = capturedSim!.nodes();
    const settledMeanX =
      settled.reduce((sum, n) => sum + (n.x ?? 0), 0) / settled.length;

    // Biased toward center: mean x rose toward the simWidth/2 target.
    expect(settledMeanX).toBeGreaterThan(seedMeanX);
    // Still within the sim width (not flung off the right).
    for (const node of settled) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(SIM_WIDTH);
    }
  });

  it('stops early once every node speed falls below the threshold', () => {
    // The velocity-based early stop posts 'end' once the layout has cooled past
    // the alpha ceiling AND the max per-node speed drops below the threshold,
    // cutting the long low-alpha tail. Drive the worker's REAL tick handler (not
    // the manual replay) so the early-stop branch runs: stop the d3 timer, then
    // dispatch tick events ourselves until 'end' is posted.
    handleMessage({
      type: 'initialize',
      nodes: cloneNodes(TWO_GROUPS),
      options: { collideRadius: SIM_COLLIDE_RADIUS, charge: 0, cohesion: 0.1 },
    });
    handleMessage({ type: 'start' });

    const sim = capturedSim!;
    sim.stop(); // halt the d3 timer; we drive ticks manually below

    // Retrieve the worker's registered tick listener (the early-stop logic lives
    // there) so we can invoke it after each manual tick, exactly as the d3 timer
    // would, without the timer's async scheduling.
    const onTick = sim.on('tick');
    expect(onTick).toBeTypeOf('function');

    let endPosted = false;
    // Tick until the worker's tick handler posts 'end' via the early stop, or we
    // exhaust a generous budget (the layout settles well within this).
    for (let i = 0; i < 600 && !endPosted; i += 1) {
      sim.tick();
      onTick!.call(sim);
      endPosted = posted.some((m) => m.type === 'end');
    }

    expect(endPosted).toBe(true);
    // The simulation actually settled: max per-node speed is tiny at the stop.
    const maxSpeed = Math.max(
      ...sim.nodes().map((n) => Math.hypot(n.vx ?? 0, n.vy ?? 0)),
    );
    expect(maxSpeed).toBeLessThan(0.01);
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

describe('autoLayout worker — sim-space spacing guarantee', () => {
  // The hook seeds in ISOTROPIC, SCREEN-NORMALISED space (px / canvas height) on
  // a non-square canvas. Collision must enforce the minimum gap isotropically
  // (the same scale on both axes), so the settled minimum center-to-center
  // distance is >= 2 * collideRadius regardless of aspect ratio.
  const COLLIDE_RADIUS = SIM_COLLIDE_RADIUS;
  const MIN_CENTER_TO_CENTER = 2 * COLLIDE_RADIUS;
  // d3-force's forceCollide leaves a small residual overlap even at strength(1);
  // allow a modest tolerance below the theoretical minimum.
  const TOLERANCE = 0.04; // 4%

  // A wide 16:9 canvas — the case where normalized-space collision would
  // collapse the vertical gap into a flattened ellipse. In sim space the x-axis
  // spans [0, aspect], the y-axis [0, 1].
  const ASPECT = 1600 / 900;

  // Map a normalized 0-1 position into sim space (x scaled by aspect).
  const sim = (xNorm: number, yNorm: number) => ({
    x: xNorm * ASPECT,
    y: yNorm,
  });

  // With no bounds force the layout is unconfined; assert it stays finite and
  // near the seeded region rather than flying off — collision spreads nodes by at
  // most a few node-widths from the cluster centre.
  const assertBounded = (nodes: SimNode[]) => {
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Math.abs(node.x ?? 0)).toBeLessThan(ASPECT * 2 + 1);
      expect(Math.abs(node.y ?? 0)).toBeLessThan(ASPECT * 2 + 1);
    }
  };

  it('separates overlapping ungrouped nodes to the enforced minimum (no clustering)', () => {
    // Six nodes seeded almost on top of each other near the canvas centre, with
    // NO group keys: collision alone must push them apart to the minimum gap.
    const center = sim(0.5, 0.5);
    const nodes: SimNode[] = Array.from({ length: 6 }, (_, i) => ({
      nodeId: `n${i}`,
      x: center.x + (i % 3) * 0.001,
      y: center.y + Math.floor(i / 3) * 0.001,
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
    const center = sim(0.5, 0.5);
    const nodes: SimNode[] = Array.from({ length: 8 }, (_, i) => ({
      nodeId: `g${i}`,
      x: center.x + (i % 4) * 0.002,
      y: center.y + Math.floor(i / 4) * 0.002,
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

  it('holds the gap on both axes on a non-square canvas (isotropic in sim space)', () => {
    // Nodes seeded in a vertical stack a tiny gap apart. In normalized space this
    // gap would survive on the short (height) axis but collapse visually; in sim
    // space collision enforces the same minimum regardless of axis.
    const x = sim(0.5, 0).x;
    const nodes: SimNode[] = Array.from({ length: 5 }, (_, i) => ({
      nodeId: `v${i}`,
      x,
      y: 0.5 + i * 0.003,
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
    // The store clamps each node independently AFTER collision, so an upward bias
    // that drives a group to the top edge would project several separated nodes
    // onto the same boundary line and re-introduce overlap. The worker's
    // post-collision bounds force solves this by confining strays to the wall in
    // the same pass collision separates them, so the settled layout is both inside
    // the inset box AND overlap-free against the wall. The bounds box is expressed
    // in sim units: [inset, simWidth - inset] x [inset, simHeight - inset].
    const INSET = 64 / 900; // sim-space inset (px inset / reference height)
    const SIM_WIDTH = ASPECT;
    const SIM_HEIGHT = 1;
    const maxX = SIM_WIDTH - INSET;
    const maxY = SIM_HEIGHT - INSET;

    // Seed nodes OUTSIDE the inset box (some past every edge) and overlapping, so
    // the bounds force must both pull them in and collision must keep them apart.
    const nodes: SimNode[] = [
      { nodeId: 'o0', x: -0.25, y: -0.2 },
      { nodeId: 'o1', x: -0.24, y: -0.19 },
      { nodeId: 'o2', x: SIM_WIDTH + 0.35, y: SIM_HEIGHT + 0.25 },
      { nodeId: 'o3', x: SIM_WIDTH + 0.34, y: SIM_HEIGHT + 0.26 },
      { nodeId: 'o4', x: SIM_WIDTH + 0.33, y: -0.18 },
      { nodeId: 'o5', x: -0.22, y: SIM_HEIGHT + 0.22 },
    ];

    handleMessage({
      type: 'initialize',
      nodes,
      options: {
        collideRadius: COLLIDE_RADIUS,
        boundsInset: INSET,
        simWidth: SIM_WIDTH,
        simHeight: SIM_HEIGHT,
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
