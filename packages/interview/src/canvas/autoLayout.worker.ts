/* eslint-disable no-console */
// Shared force-layout worker for the canvas auto-layout engine.
//
// Narrative, Sociogram, and Network Composer use one canonical force profile.
// Initialize options contain only canvas-derived geometry; callers cannot tune
// the simulation per interface. Group cohesion remains data-driven and is inert
// when no group keys are supplied. The worker has no persistence concept at all
// — it only postMessages positions; nothing here writes node attributes.
//
// The simulation runs in an ISOTROPIC, SCREEN-NORMALISED space (the hook scales
// the authored normalized 0-1 positions by canvas-height before seeding; see
// layoutGeometry's toSim). The x-axis spans [0, aspect], the y-axis spans [0, 1],
// with the SAME scale on both axes, so collision stays visually circular while
// charge/centering — fixed in sim space — make the layout SHAPE independent of
// canvas size. px-derived distances (collide/link/bounds) arrive already divided
// by the canvas height, so they shrink in sim units on a larger canvas, giving
// proportionally more breathing room there.
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import type { VariableOptionValue } from '@codaco/protocol-validation';

import { forceGroupCohesion } from './forceGroupCohesion';
import {
  collideRadiusForNode,
  EDGE_GAP_RATIO,
  FALLBACK_NODE_RADIUS,
} from './layoutGeometry';

type AutoLayoutOptions = {
  alphaDecay: number;
  velocityDecay: number;
  charge: number;
  collideRadius: number;
  linkDistance: number;
  linkStrength: number;
  biasXFraction: number;
  biasXStrength: number;
  biasYFraction: number;
  biasYStrength: number;
  boundsInset: number;
  // Sim-space extents: the x-axis spans [0, simWidth] (= aspect = W/H) and the
  // y-axis spans [0, simHeight] (= 1). The hook derives these from the live
  // canvas dimensions and supplies them so the forceX/forceY targets and the
  // bounds box are expressed in sim units rather than pixels.
  simWidth: number;
  simHeight: number;
  alphaMin: number;
  startAlpha: number;
};

// These values depend on the rendered node size and canvas dimensions, so the
// hook supplies them at initialization. Every force-tuning value remains owned
// by DEFAULT_OPTIONS below.
type AutoLayoutRuntimeOptions = Pick<
  AutoLayoutOptions,
  'collideRadius' | 'boundsInset' | 'simWidth' | 'simHeight'
>;

// Sim-space collision radius derived from the FALLBACK node radius on a typical
// ~800px-tall canvas (collideRadiusForNode(48) / 800 ≈ 0.084). Only used to seed
// the linkDistance default; the hook always overrides collideRadius with the live
// measured value divided by the canvas height.
const FALLBACK_SIM_COLLIDE_RADIUS =
  collideRadiusForNode(FALLBACK_NODE_RADIUS) / 800;
const LINK_DISTANCE_COLLIDE_RATIO = 1.9;

const DEFAULT_OPTIONS: AutoLayoutOptions = {
  // A hot start and slow 500-tick cooldown let a layout built from scratch
  // escape local minima before settling.
  alphaDecay: 1 - 0.001 ** (1 / 500),
  velocityDecay: 0.3,
  // Screen-normalized repulsion spreads disconnected nodes while collision
  // guarantees the minimum gap and optional cohesion clusters grouped nodes.
  charge: -0.004,
  // collideRadius is a SIM-SPACE center-to-center half-distance (px collide
  // radius / canvas height): two nodes cannot settle closer than 2 *
  // collideRadius. The hook always overrides this with the live measured value;
  // this default mirrors the base-theme rendered size on a typical canvas.
  collideRadius: FALLBACK_SIM_COLLIDE_RADIUS,
  // Edge attraction (forceLink): connected nodes pull together so topologies
  // self-organise. linkDistance is set just BELOW the collision floor
  // (2*collideRadius), so links pull connected nodes down ONTO the floor and
  // collision holds them there — making connected pairs the closest in the
  // layout. Unconnected nodes have no such pull and are spread beyond the floor
  // by charge, so a connected pair is never farther apart than an unconnected
  // one (the visual principle that connected nodes sit closer than unconnected
  // ones). Initialization derives it from the live collide radius here.
  linkDistance: LINK_DISTANCE_COLLIDE_RATIO * FALLBACK_SIM_COLLIDE_RADIUS,
  // Firm enough that connected nodes reach the collision floor during the anneal
  // and stay pressed there against charge, giving connected pairs a visibly
  // tighter spacing than the charge-spread unconnected pairs.
  linkStrength: 0.5,
  // Symmetric horizontal and vertical positioning forces keep every interface's
  // composition centered. Fractions are targets within the simulation extents.
  biasXFraction: 0.5,
  biasXStrength: 0.13,
  biasYFraction: 0.5,
  biasYStrength: 0.13,
  // Hard inset (sim units) from each edge that confines node CENTERS, applied as
  // a post-collision bounds force. The hook supplies the value matching the
  // store's drag/placement clamp (px inset / canvas height) so the clamp
  // becomes a no-op once the simulation settles.
  boundsInset: 0,
  // Sim-space extents; the hook supplies them so the forceX/forceY targets and
  // the bounds box are expressed in sim units. Both fall back to 0 (the
  // corresponding bias/bounds inert) until provided.
  simWidth: 0,
  simHeight: 0,
  // alphaMin raised from 0.001 so the anneal stops once the layout is essentially
  // settled rather than grinding through many invisible low-alpha ticks (FIX 2).
  // The velocity-based early stop below catches the common case sooner; this is
  // the hard floor. Tune visually.
  alphaMin: 0.025,
  startAlpha: 1,
};

// Per-node speed (sim units / tick) below which — for ALL nodes — the layout is
// considered visually settled and the simulation is stopped early, cutting the
// long low-alpha anneal tail (FIX 2). Sim coordinates span ~[0, 1.x], so this is
// a tiny fraction of the canvas per tick. Tune visually.
const EARLY_STOP_MAX_SPEED = 0.0008;

// Group-cohesion strength. Deliberately INTERNAL (not an initialize option) so
// grouped nodes cluster identically in every interface that uses the shared
// auto-layout; whether cohesion acts at all is decided solely by whether the
// caller supplies a groupVariable (no groupKeys → the force is inert).
// Displacement-proportional, so scale-invariant across canvas sizes.
const GROUP_COHESION_STRENGTH = 0.1;

// Nodes with no links and no group sit on an oval ring instead of being
// centred among the connected nodes.
const RING_RADIUS = 0.78;
const RING_ROUNDNESS = 0.5;
const RING_STRENGTH = 0.4;
const SEED_CIRCLE_RADIUS = 0.6;
const ANCHOR_STRENGTH = 0.08;
const REHEAT_ALPHA = 0.3;
const LAYOUT_ATTEMPTS = 4;
// Above this many links scoring attempts costs too much, so one attempt is used.
const MAX_SCORED_LINKS = 1000;
const ATTEMPT_JITTER = 0.1;
const MAX_TICKS = 1000;

type SimNode = SimulationNodeDatum & {
  nodeId?: string;
  groupKeys?: VariableOptionValue[];
  // false when the node has no stored position yet; the worker seeds it.
  placed?: boolean;
  anchorX?: number;
  anchorY?: number;
};

// Link endpoints arrive as INDICES into the seeded node array (d3 forceLink's
// index form); forceLink mutates link objects in place, so each registration
// gets a fresh clone.
type SimLink = SimulationLinkDatum<SimNode>;

let simulation: Simulation<SimNode, undefined>;
let links: SimLink[] = [];
let options: AutoLayoutOptions = { ...DEFAULT_OPTIONS };
let running = false;
// Distinguishes a user pause (toggle off → `stop`) from a natural settle (the
// anneal converged). Both leave `running` false, but only a user pause should
// suppress a drag/edge reheat: a drag or edge change after a natural settle must
// warm the layout back up, whereas one after a user pause must leave it stopped.
let paused = false;

// Width (sim units) of the deceleration band just inside each wall, over which
// the inward nudge ramps from 0 (at the band's inner edge) to full (at the wall).
// ~0.06 is roughly a node-and-a-half on a unit-tall canvas. Tune visually.
const BOUNDS_MARGIN = 0.06;
// Inward push per unit penetration into the margin band, scaled by alpha so it
// fades as the layout cools. Strong enough to bleed off approach speed before the
// wall. Tune visually.
const BOUNDS_PUSH = 0.4;
// Factor applied to the outward velocity component when a node is clamped to the
// wall: 0 = the old hard stop (bounced), 1 = no damping. A small value lets the
// node settle against the boundary instead of rebounding. Tune visually.
const BOUNDS_OUTWARD_DAMP = 0.2;

// Confine one axis of one node to [min, max]: decelerate within the margin band,
// then hard-clamp at the wall while DAMPING (not zeroing) the outward velocity.
// Keyed by the live position/velocity field names so x and y share one routine.
const applyBoundAxis = (
  node: SimNode,
  posKey: 'x' | 'y',
  velKey: 'vx' | 'vy',
  min: number,
  max: number,
  alpha: number,
) => {
  const pos = node[posKey];
  if (pos == null) return;
  const vel = node[velKey] ?? 0;

  // Smooth inward nudge while inside the margin band (proportional to depth).
  if (pos < min + BOUNDS_MARGIN) {
    const depth = min + BOUNDS_MARGIN - pos;
    node[velKey] = vel + depth * BOUNDS_PUSH * alpha;
  } else if (pos > max - BOUNDS_MARGIN) {
    const depth = pos - (max - BOUNDS_MARGIN);
    node[velKey] = vel - depth * BOUNDS_PUSH * alpha;
  }

  // Hard clamp at the wall, damping any remaining outward velocity.
  if (pos < min) {
    node[posKey] = min;
    const v = node[velKey] ?? 0;
    if (v < 0) node[velKey] = v * BOUNDS_OUTWARD_DAMP;
  } else if (pos > max) {
    node[posKey] = max;
    const v = node[velKey] ?? 0;
    if (v > 0) node[velKey] = v * BOUNDS_OUTWARD_DAMP;
  }
};

// Largest per-node speed (sim units / tick) across the simulation. Used by the
// velocity-based early stop to detect when the layout has visually settled.
const maxNodeSpeed = (nodes: SimNode[]): number => {
  let max = 0;
  for (const n of nodes) {
    const speed = Math.hypot(n.vx ?? 0, n.vy ?? 0);
    if (speed > max) max = speed;
  }
  return max;
};

// Alpha must have decayed below this before the velocity early stop can fire, so
// it cannot trigger on the first few near-still ticks before the layout has
// meaningfully moved.
const EARLY_STOP_ALPHA_CEILING = 0.3;

// Reference node count for the charge normalisation. The per-node repulsion is
// scaled by sqrt(CHARGE_NORM_NODES / N), so the summed outward force grows with
// sqrt(N): larger networks take more of the canvas instead of packing tighter,
// without growing so fast that they pin to the bounds.
const CHARGE_NORM_NODES = 10;

const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const linkEndpoints = (): [number, number][] =>
  links.flatMap((link) =>
    typeof link.source === 'number' && typeof link.target === 'number'
      ? [[link.source, link.target] as [number, number]]
      : [],
  );

const linkedIndices = () => new Set(linkEndpoints().flat());

const isIsolated = (node: SimNode, index: number, linked: Set<number>) =>
  !linked.has(index) && !node.groupKeys?.length;

const ringAxes = () => {
  const { simWidth, simHeight, boundsInset } = options;
  if (simWidth <= 0 || simHeight <= 0) return null;
  const halfX = simWidth / 2 - boundsInset;
  const halfY = simHeight / 2 - boundsInset;
  const round = Math.min(halfX, halfY);
  return {
    cx: simWidth / 2,
    cy: simHeight / 2,
    ax: RING_RADIUS * (halfX + (round - halfX) * RING_ROUNDNESS),
    ay: RING_RADIUS * (halfY + (round - halfY) * RING_ROUNDNESS),
  };
};

const cloneLinks = (ls: SimLink[]): SimLink[] =>
  ls.map((link) => ({ ...link }));

const makeLinkForce = () =>
  forceLink<SimNode, SimLink>(cloneLinks(links))
    .distance(options.linkDistance)
    .strength(options.linkStrength);

const registerForces = (sim: Simulation<SimNode, undefined>) => {
  const linked = linkedIndices();
  // Until the first link exists nobody goes to the ring and the composition
  // stays round, so people with no ties yet form one central cluster.
  const anyLinks = linked.size > 0;
  const isolated = (node: SimNode, index: number) =>
    anyLinks && isIsolated(node, index, linked);
  if (options.charge !== 0) {
    // Guard against an empty seed so the divisor is never 0.
    const nodeCount = Math.max(sim.nodes().length, 1);
    sim.force(
      'charge',
      forceManyBody().strength(
        options.charge * Math.sqrt(CHARGE_NORM_NODES / nodeCount),
      ),
    );
  } else {
    sim.force('charge', null);
  }
  // strength(1) + iterations(3) firmly enforces the minimum distance rather
  // than merely nudging, so the guaranteed gap holds even from a tightly
  // clustered seed.
  sim.force(
    'collide',
    forceCollide().radius(options.collideRadius).strength(1).iterations(3),
  );
  // Soft-then-hard bounds, applied AFTER collide so collision separates pairs
  // first and bounds then confines any stray to the wall; the next tick's collide
  // re-separates along the wall. Two-part to ease nodes to rest at the inset
  // instead of slamming and rebounding (FIX 4):
  //   1. Within a thin margin band just inside each wall, a smooth inward nudge
  //      proportional to penetration depth decelerates an approaching node before
  //      it reaches the wall.
  //   2. The hard position clamp still pins any node past the inset onto it (this
  //      is what makes the store clamp a no-op and guarantees no overlap at
  //      settle), but the outward velocity is DAMPED rather than zeroed, so the
  //      node eases to rest against the boundary rather than bouncing.
  // Inert unless a positive inset and resolvable sim extents are supplied. The
  // closure reads sim.nodes() live so it sees pinned/updated nodes.
  if (
    options.boundsInset > 0 &&
    options.simWidth > 0 &&
    options.simHeight > 0
  ) {
    const inset = options.boundsInset;
    const maxX = options.simWidth - inset;
    const maxY = options.simHeight - inset;
    const boundsForce = (alpha: number) => {
      for (const n of sim.nodes()) {
        if (n.x == null || n.y == null) continue;
        // Decelerate within the band before the wall, then clamp + damp at it.
        applyBoundAxis(n, 'x', 'vx', inset, maxX, alpha);
        applyBoundAxis(n, 'y', 'vy', inset, maxY, alpha);
      }
    };
    sim.force('bounds', boundsForce);
  } else {
    sim.force('bounds', null);
  }
  // Group cohesion is always registered at the fixed internal strength; it is
  // inert when no node carries groupKeys (Sociogram passes no groupVariable, so
  // every node's groupKeys is empty and no bucket survives the singleton drop).
  sim.force(
    'group',
    forceGroupCohesion<SimNode>().strength(GROUP_COHESION_STRENGTH),
  );
  // Edge attraction. The sim-space linkDistance is derived from collideRadius so
  // the target spacing stays consistent with the collision guarantee. Registered
  // even with no links (an empty forceLink is inert).
  sim.force('link', makeLinkForce());
  // Horizontal positioning toward a target across the sim width (center by
  // default), keeping the layout centred. Inert unless a positive
  // strength and a resolvable target (sim width) are both supplied.
  // Once there are links, the horizontal pull on a non-square canvas is
  // divided by aspect² so the composition takes the canvas shape.
  if (options.biasXStrength > 0 && options.simWidth > 0) {
    const aspect =
      options.simHeight > 0 ? options.simWidth / options.simHeight : 1;
    const strength = anyLinks
      ? options.biasXStrength / (aspect * aspect)
      : options.biasXStrength;
    sim.force(
      'biasX',
      forceX<SimNode>(options.simWidth * options.biasXFraction).strength(
        (node, index) => (isolated(node, index) ? 0 : strength),
      ),
    );
  } else {
    sim.force('biasX', null);
  }
  // Vertical positioning toward a target across the sim height (center by
  // default). Inert unless a positive strength and a resolvable target are both
  // supplied.
  if (options.biasYStrength > 0 && options.simHeight > 0) {
    sim.force(
      'biasY',
      forceY<SimNode>(options.simHeight * options.biasYFraction).strength(
        (node, index) => (isolated(node, index) ? 0 : options.biasYStrength),
      ),
    );
  } else {
    sim.force('biasY', null);
  }
  const ring = ringAxes();
  if (ring) {
    sim.force('ring', (alpha: number) => {
      sim.nodes().forEach((node, index) => {
        if (!isolated(node, index)) return;
        if (node.x == null || node.y == null) return;
        const dx = node.x - ring.cx;
        const dy = node.y - ring.cy;
        const scale = Math.hypot(dx / ring.ax, dy / ring.ay) || 1e-6;
        node.vx = (node.vx ?? 0) + (dx / scale - dx) * RING_STRENGTH * alpha;
        node.vy = (node.vy ?? 0) + (dy / scale - dy) * RING_STRENGTH * alpha;
      });
    });
  } else {
    sim.force('ring', null);
  }
};

// Holds placed nodes near where they are now, so a change re-settles the
// layout without reshuffling it.
const setAnchors = (sim: Simulation<SimNode, undefined>, enabled: boolean) => {
  if (!enabled) {
    sim.force('anchorX', null);
    sim.force('anchorY', null);
    return;
  }
  for (const node of sim.nodes()) {
    node.anchorX = node.x;
    node.anchorY = node.y;
  }
  const strength = (node: SimNode) =>
    node.placed === false ? 0 : ANCHOR_STRENGTH;
  sim.force(
    'anchorX',
    forceX<SimNode>((node) => node.anchorX ?? 0).strength(strength),
  );
  sim.force(
    'anchorY',
    forceY<SimNode>((node) => node.anchorY ?? 0).strength(strength),
  );
};

const neighbourIndices = (count: number) => {
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (const [source, target] of linkEndpoints()) {
    neighbours[source]?.push(target);
    neighbours[target]?.push(source);
  }
  return neighbours;
};

// Node indices ordered so each connected component is contiguous.
const componentOrder = (count: number) => {
  const neighbours = neighbourIndices(count);
  const starts = [...neighbours.keys()].toSorted(
    (a, b) => neighbours[b]!.length - neighbours[a]!.length,
  );
  const order: number[] = [];
  const seen = new Set<number>();
  for (const start of starts) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    while (queue.length > 0) {
      const index = queue.shift()!;
      order.push(index);
      for (const next of neighbours[index]!) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return order;
};

// A fresh layout starts on a circle grouped by component. A node added to an
// existing layout starts beside its placed neighbours, or in the emptiest spot
// on the ring.
const seedUnplaced = (nodes: SimNode[]) => {
  const ring = ringAxes();
  if (!ring || !nodes.some((node) => node.placed === false)) return;

  if (nodes.every((node) => node.placed === false)) {
    const positions = new Map(
      componentOrder(nodes.length).map((index, position) => [index, position]),
    );
    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * (positions.get(index) ?? 0)) / nodes.length;
      node.x =
        ring.cx +
        SEED_CIRCLE_RADIUS * (ring.cx - options.boundsInset) * Math.cos(angle);
      node.y =
        ring.cy +
        SEED_CIRCLE_RADIUS * (ring.cy - options.boundsInset) * Math.sin(angle);
    });
    return;
  }

  const random = seededRandom(1);
  const neighbours = neighbourIndices(nodes.length);
  nodes.forEach((node, index) => {
    if (node.placed !== false) return;
    const placedNeighbours = neighbours[index]!.map(
      (neighbour) => nodes[neighbour]!,
    ).filter((neighbour) => neighbour.placed !== false);
    if (placedNeighbours.length > 0) {
      const count = placedNeighbours.length;
      node.x =
        placedNeighbours.reduce((sum, n) => sum + (n.x ?? 0), 0) / count +
        (random() - 0.5) * options.collideRadius;
      node.y =
        placedNeighbours.reduce((sum, n) => sum + (n.y ?? 0), 0) / count +
        (random() - 0.5) * options.collideRadius;
      return;
    }
    let emptiest = 0;
    for (let step = 0; step < 36; step += 1) {
      const angle = (2 * Math.PI * step) / 36;
      const x = ring.cx + ring.ax * Math.cos(angle);
      const y = ring.cy + ring.ay * Math.sin(angle);
      const nearest = Math.min(
        ...nodes
          .filter((other) => other !== node)
          .map((other) => Math.hypot((other.x ?? 0) - x, (other.y ?? 0) - y)),
      );
      if (nearest > emptiest) {
        emptiest = nearest;
        node.x = x;
        node.y = y;
      }
    }
  });
};

const segmentsCross = (a: SimNode, b: SimNode, c: SimNode, d: SimNode) => {
  const side = (p: SimNode, q: SimNode, r: SimNode) =>
    ((q.x ?? 0) - (p.x ?? 0)) * ((r.y ?? 0) - (p.y ?? 0)) -
    ((q.y ?? 0) - (p.y ?? 0)) * ((r.x ?? 0) - (p.x ?? 0));
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
};

const distanceToSegment = (p: SimNode, a: SimNode, b: SimNode) => {
  const ax = a.x ?? 0;
  const ay = a.y ?? 0;
  const dx = (b.x ?? 0) - ax;
  const dy = (b.y ?? 0) - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          (((p.x ?? 0) - ax) * dx + ((p.y ?? 0) - ay) * dy) / lengthSquared,
        ),
      )
    : 0;
  return Math.hypot((p.x ?? 0) - (ax + t * dx), (p.y ?? 0) - (ay + t * dy));
};

// Lower is better: edge crossings, edges passing through nodes, and unlinked
// nodes crowded closer than the collision gap.
const layoutScore = (nodes: SimNode[]) => {
  const radius = options.collideRadius / (1 + EDGE_GAP_RATIO);
  const edges = linkEndpoints();
  const linkedPairs = new Set(
    edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`),
  );
  let crossings = 0;
  let throughNodes = 0;
  let closest = Infinity;
  edges.forEach(([a, b], i) => {
    for (let j = i + 1; j < edges.length; j += 1) {
      const [c, d] = edges[j]!;
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(nodes[a]!, nodes[b]!, nodes[c]!, nodes[d]!))
        crossings += 1;
    }
    nodes.forEach((node, index) => {
      if (index === a || index === b) return;
      if (distanceToSegment(node, nodes[a]!, nodes[b]!) < radius * 1.05) {
        throughNodes += 1;
      }
    });
  });
  nodes.forEach((node, i) => {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (linkedPairs.has(`${i}-${j}`)) continue;
      const other = nodes[j]!;
      closest = Math.min(
        closest,
        Math.hypot(
          (node.x ?? 0) - (other.x ?? 0),
          (node.y ?? 0) - (other.y ?? 0),
        ),
      );
    }
  });
  const gap = (closest - 2 * radius) / (2 * radius);
  return crossings * 3 + throughNodes * 5 + (gap < 0.4 ? (0.4 - gap) * 10 : 0);
};

const settle = (sim: Simulation<SimNode, undefined>) => {
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    sim.tick();
    if (
      sim.alpha() < options.alphaMin ||
      (sim.alpha() < EARLY_STOP_ALPHA_CEILING &&
        maxNodeSpeed(sim.nodes()) < EARLY_STOP_MAX_SPEED)
    ) {
      return;
    }
  }
};

type InitializeMessage = {
  type: 'initialize';
  nodes: SimNode[];
  links?: SimLink[];
  options?: Partial<AutoLayoutRuntimeOptions>;
  // A worker replaced while the user has the layout paused stays paused.
  paused?: boolean;
  // The node set changed since the previous initialize (an add or a delete).
  incremental?: boolean;
};

type StopMessage = { type: 'stop' };
type StartMessage = { type: 'start' };
type ReheatMessage = { type: 'reheat' };

type UpdateLinksMessage = {
  type: 'update_links';
  links: SimLink[];
};

type UpdateNodeMessage = {
  type: 'update_node';
  nodeId: string;
  node: Partial<SimNode>;
};

type Message =
  | InitializeMessage
  | StopMessage
  | StartMessage
  | ReheatMessage
  | UpdateLinksMessage
  | UpdateNodeMessage;

let needsLayout = false;
// A change to the nodes or links, settled anchored rather than from scratch.
let incrementalChange = false;

const createSimulation = (nodes: SimNode[]) => {
  const sim = forceSimulation(nodes);
  sim.velocityDecay(options.velocityDecay);
  sim.alphaDecay(options.alphaDecay);
  sim.alphaMin(options.alphaMin);
  registerForces(sim);
  sim.alpha(0).stop();

  // Only a drag runs on the d3 timer; every other run settles synchronously.
  sim.on('tick', () => {
    const simNodes = sim.nodes();
    postMessage({ type: 'tick', nodes: simNodes });
    if (
      running &&
      sim.alpha() < EARLY_STOP_ALPHA_CEILING &&
      maxNodeSpeed(simNodes) < EARLY_STOP_MAX_SPEED
    ) {
      running = false;
      sim.stop();
      postMessage({ type: 'end', nodes: simNodes });
    }
  });
  sim.on('end', () => {
    postMessage({ type: 'end', nodes: sim.nodes() });
  });
  return sim;
};

const finish = () => {
  running = false;
  needsLayout = false;
  incrementalChange = false;
  for (const node of simulation.nodes()) node.placed = true;
  postMessage({ type: 'end', nodes: simulation.nodes() });
};

const runToEnd = (alpha: number) => {
  simulation.stop();
  simulation.alpha(alpha);
  settle(simulation);
  finish();
};

// A layout built from scratch keeps the best of several runs.
const layoutFromScratch = () => {
  const seed = simulation.nodes();
  const attempts = links.length > MAX_SCORED_LINKS ? 1 : LAYOUT_ATTEMPTS;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Each attempt after the first starts from a jittered copy of the seed so
    // the attempts explore different arrangements.
    const random = seededRandom(attempt + 1);
    const jitter = () =>
      attempt === 0 ? 0 : (random() - 0.5) * 2 * ATTEMPT_JITTER;
    const candidate = createSimulation(
      seed.map((node) => ({
        ...node,
        x: (node.x ?? 0) + jitter(),
        y: (node.y ?? 0) + jitter(),
      })),
    );
    candidate.randomSource(random);
    candidate.alpha(options.startAlpha);
    settle(candidate);
    const score = attempts === 1 ? 0 : layoutScore(candidate.nodes());
    if (score < bestScore) {
      bestScore = score;
      simulation = candidate;
    }
  }
  finish();
};

export function handleMessage(data: Message) {
  switch (data.type) {
    case 'initialize': {
      console.debug('autolayout-worker:initialize', data.nodes.length, 'nodes');

      options = { ...DEFAULT_OPTIONS, ...data.options };
      // Link distance is part of the canonical force profile, but its absolute
      // sim-space value follows the live card collision radius.
      if (data.options?.collideRadius !== undefined) {
        options.linkDistance =
          LINK_DISTANCE_COLLIDE_RATIO * data.options.collideRadius;
      }
      links = data.links ?? [];

      seedUnplaced(data.nodes);
      simulation = createSimulation(data.nodes);
      running = false;
      paused = data.paused ?? false;
      needsLayout = true;
      incrementalChange = data.incremental ?? false;
      break;
    }
    case 'start': {
      if (!simulation) return;
      console.debug('autolayout-worker:start');
      const resuming = paused;
      paused = false;
      if (!needsLayout && !resuming) return;

      const nodes = simulation.nodes();
      const unplaced = nodes.filter((node) => node.placed === false).length;
      if (nodes.length > 0 && unplaced === nodes.length) {
        layoutFromScratch();
      } else if (unplaced > 0 || incrementalChange) {
        setAnchors(simulation, true);
        runToEnd(REHEAT_ALPHA);
      } else {
        setAnchors(simulation, false);
        runToEnd(options.startAlpha);
      }
      break;
    }
    case 'stop': {
      if (!simulation) return;
      console.debug('autolayout-worker:stop');
      running = false;
      paused = true;
      simulation.stop();
      postMessage({ type: 'end', nodes: simulation.nodes() });
      break;
    }
    case 'reheat': {
      if (!simulation) return;
      console.debug('autolayout-worker:reheat');
      paused = false;
      setAnchors(simulation, true);
      runToEnd(REHEAT_ALPHA);
      break;
    }
    case 'update_links': {
      if (!simulation) return;

      const endpoints = JSON.stringify(linkEndpoints());
      links = data.links;
      if (JSON.stringify(linkEndpoints()) === endpoints) break;
      // Which nodes are linked changes the ring and centering forces too.
      registerForces(simulation);

      // A sim the user paused stays paused until they resume.
      if (paused) {
        needsLayout = true;
        incrementalChange = true;
      } else {
        setAnchors(simulation, true);
        runToEnd(REHEAT_ALPHA);
      }
      break;
    }
    case 'update_node': {
      if (!simulation) return;

      const nodes = simulation.nodes().map((node) => {
        if (node.nodeId !== data.nodeId) return node;
        // When clearing fx/fy, snap x/y to the fixed position to prevent
        // a flicker as the node jumps from fx/fy to its drifted internal x/y.
        const patched = { ...data.node };
        if (patched.fx === null && node.fx != null) patched.x = node.fx;
        if (patched.fy === null && node.fy != null) patched.y = node.fy;
        return { ...node, ...patched };
      });

      // Re-setting nodes re-runs each force's initialize, rebuilding the
      // groupKeys-derived buckets (the spread above preserves groupKeys).
      simulation.nodes(nodes);
      // forceLink resolved its endpoints to the previous node objects, which the
      // spread above replaced; re-register so it resolves the new identities.
      simulation.force('link', makeLinkForce());

      if (paused) break;
      if (data.node.fx != null || data.node.fy != null) {
        // While a node is held the layout runs live around it.
        if (!running) setAnchors(simulation, true);
        running = true;
        simulation.alpha(REHEAT_ALPHA).restart();
      } else {
        // Anchor at the release position, not where the drag began.
        setAnchors(simulation, true);
        runToEnd(Math.max(simulation.alpha(), REHEAT_ALPHA));
      }
      break;
    }
    default:
  }
}

self.onmessage = ({ data }: { data: Message }) => {
  handleMessage(data);
};
