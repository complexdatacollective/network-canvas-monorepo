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
const LINK_DISTANCE_COLLIDE_RATIO = 1.8;

const DEFAULT_OPTIONS: AutoLayoutOptions = {
  // A hot start and slow 500-tick cooldown let a layout built from scratch
  // escape local minima before settling.
  alphaDecay: 1 - 0.001 ** (1 / 500),
  velocityDecay: 0.3,
  // Screen-normalized repulsion spreads disconnected nodes while collision
  // guarantees the minimum gap and optional cohesion clusters grouped nodes.
  charge: -0.006,
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
  linkStrength: 1,
  // Symmetric horizontal and vertical positioning forces keep every interface's
  // composition centered. Fractions are targets within the simulation extents.
  biasXFraction: 0.5,
  biasXStrength: 0.35,
  biasYFraction: 0.5,
  biasYStrength: 0.35,
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

// A new node with no placed neighbours starts in the emptiest spot on this
// oval ring.
const RING_RADIUS = 0.78;
const RING_ROUNDNESS = 0.5;
const LINK_ITERATIONS = 3;
const COMPONENT_GAP = 2;
const COMPONENT_GAP_STRENGTH = 0.25;
const GAP_PASSES = 100;
const UNTANGLE_ALPHA = 0.1;
const SEED_CIRCLE_RADIUS = 0.6;
const ANCHOR_STRENGTH = 0.08;
const REHEAT_ALPHA = 0.3;
const LAYOUT_ATTEMPTS = 4;
// Above this many links scoring attempts costs too much, so one attempt is used.
const MAX_SCORED_LINKS = 1000;
const UNTANGLE_BUDGET = 5_000_000;
const ATTEMPT_JITTER = 0.1;
const MAX_TICKS = 1000;
const PLAYBACK_FRAMES = 60;
const PLAYBACK_MAX_OVERLAP = 0.05;

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
    .strength(options.linkStrength)
    .iterations(LINK_ITERATIONS);

const nodeRadius = () => options.collideRadius / (1 + EDGE_GAP_RATIO);

const componentIds = (count: number) => {
  const neighbours = neighbourIndices(count);
  const ids = Array.from({ length: count }, () => -1);
  let next = 0;
  for (let start = 0; start < count; start += 1) {
    if (ids[start] !== -1) continue;
    ids[start] = next;
    const queue = [start];
    while (queue.length > 0) {
      for (const neighbour of neighbours[queue.shift()!]!) {
        if (ids[neighbour] !== -1) continue;
        ids[neighbour] = next;
        queue.push(neighbour);
      }
    }
    next += 1;
  }
  return ids;
};

const registerForces = (sim: Simulation<SimNode, undefined>) => {
  // Until the first link exists the composition stays round.
  const anyLinks = links.length > 0;
  const components = componentIds(sim.nodes().length);
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
  // Once there are links, the horizontal pull on a non-square canvas is
  // divided by aspect² so the composition takes the canvas shape.
  const members = new Map<number, number[]>();
  components.forEach((component, index) => {
    members.set(component, [...(members.get(component) ?? []), index]);
  });
  const aspect =
    options.simHeight > 0 ? options.simWidth / options.simHeight : 1;
  const strengthX =
    options.simWidth > 0
      ? anyLinks
        ? options.biasXStrength / (aspect * aspect)
        : options.biasXStrength
      : 0;
  const strengthY = options.simHeight > 0 ? options.biasYStrength : 0;
  const targetX = options.simWidth * options.biasXFraction;
  const targetY = options.simHeight * options.biasYFraction;
  sim.force('centre', (alpha: number) => {
    const nodes = sim.nodes();
    for (const indices of members.values()) {
      let x = 0;
      let y = 0;
      for (const index of indices) {
        x += nodes[index]!.x ?? 0;
        y += nodes[index]!.y ?? 0;
      }
      const vx = (targetX - x / indices.length) * strengthX * alpha;
      const vy = (targetY - y / indices.length) * strengthY * alpha;
      for (const index of indices) {
        const node = nodes[index]!;
        node.vx = (node.vx ?? 0) + vx;
        node.vy = (node.vy ?? 0) + vy;
      }
    }
  });
  const reach = (2 + COMPONENT_GAP) * nodeRadius();
  sim.force('componentGap', () => {
    const nodes = sim.nodes();
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (components[i] === components[j]) continue;
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = (b.x ?? 0) + (b.vx ?? 0) - (a.x ?? 0) - (a.vx ?? 0);
        const dy = (b.y ?? 0) + (b.vy ?? 0) - (a.y ?? 0) - (a.vy ?? 0);
        const distance = Math.hypot(dx, dy) || 1e-6;
        if (distance >= reach) continue;
        const push = ((reach - distance) / distance) * COMPONENT_GAP_STRENGTH;
        a.vx = (a.vx ?? 0) - dx * push;
        a.vy = (a.vy ?? 0) - dy * push;
        b.vx = (b.vx ?? 0) + dx * push;
        b.vy = (b.vy ?? 0) + dy * push;
      }
    }
  });
};

// Holds placed nodes near where they are now, so a change re-settles the
// layout without reshuffling it.
const setAnchors = (sim: Simulation<SimNode, undefined>) => {
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

const layoutProblems = (nodes: SimNode[]) => {
  const radius = nodeRadius();
  const edges = linkEndpoints();
  const involved = new Set<number>();
  let crossings = 0;
  let throughNodes = 0;
  edges.forEach(([a, b], i) => {
    for (let j = i + 1; j < edges.length; j += 1) {
      const [c, d] = edges[j]!;
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(nodes[a]!, nodes[b]!, nodes[c]!, nodes[d]!)) {
        crossings += 1;
        for (const index of [a, b, c, d]) involved.add(index);
      }
    }
    nodes.forEach((node, index) => {
      if (index === a || index === b) return;
      if (distanceToSegment(node, nodes[a]!, nodes[b]!) < radius * 1.05) {
        throughNodes += 1;
        involved.add(index);
      }
    });
  });
  return { crossings, throughNodes, involved };
};

// Lower is better: edge crossings, edges passing through nodes, and unlinked
// nodes crowded closer than the collision gap.
const layoutScore = (nodes: SimNode[]) => {
  const radius = nodeRadius();
  const linkedPairs = new Set(
    linkEndpoints().map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`),
  );
  const { crossings, throughNodes } = layoutProblems(nodes);
  let closest = Infinity;
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

const untangle = (nodes: SimNode[]) => {
  const swaps: [number, number][] = [];
  const edges = links.length;
  const scoreCost = edges * edges + edges * nodes.length + nodes.length ** 2;
  let checks = Math.floor(UNTANGLE_BUDGET / scoreCost);
  if (checks === 0) return swaps;
  const { involved } = layoutProblems(nodes);
  let best = layoutScore(nodes);
  const swap = (a: SimNode, b: SimNode) => {
    [a.x, b.x] = [b.x, a.x];
    [a.y, b.y] = [b.y, a.y];
  };
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (!involved.has(i) && !involved.has(j)) continue;
      if (checks === 0) break;
      checks -= 1;
      swap(nodes[i]!, nodes[j]!);
      const score = layoutScore(nodes);
      if (score < best - 1e-9) {
        best = score;
        swaps.push([i, j]);
      } else {
        swap(nodes[i]!, nodes[j]!);
      }
    }
  }
  if (swaps.length > 0) {
    for (const node of nodes) {
      node.vx = 0;
      node.vy = 0;
    }
  }
  return swaps;
};

const separate = (nodes: SimNode[]) => {
  const floor = 2 * options.collideRadius;
  const inset = options.boundsInset;
  const bounded = inset > 0 && options.simWidth > 0 && options.simHeight > 0;
  for (let pass = 0; pass < GAP_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const aFixed = a.fx != null;
        const bFixed = b.fx != null;
        if (aFixed && bFixed) continue;
        let dx = (b.x ?? 0) - (a.x ?? 0);
        let dy = (b.y ?? 0) - (a.y ?? 0);
        let distance = Math.hypot(dx, dy);
        if (distance >= floor - 1e-9) continue;
        if (distance < 1e-9) {
          dx = 1e-6;
          dy = 0;
          distance = 1e-6;
        }
        const share = (floor - distance) / distance;
        const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
        a.x = (a.x ?? 0) - dx * share * aShare;
        a.y = (a.y ?? 0) - dy * share * aShare;
        b.x = (b.x ?? 0) + dx * share * (1 - aShare);
        b.y = (b.y ?? 0) + dy * share * (1 - aShare);
        moved = true;
      }
    }
    if (bounded) {
      for (const node of nodes) {
        if (node.fx != null) continue;
        node.x = Math.min(
          options.simWidth - inset,
          Math.max(inset, node.x ?? 0),
        );
        node.y = Math.min(
          options.simHeight - inset,
          Math.max(inset, node.y ?? 0),
        );
      }
    }
    if (!moved) break;
  }
};

const isSettled = (sim: Simulation<SimNode, undefined>) =>
  sim.alpha() < options.alphaMin ||
  (sim.alpha() < EARLY_STOP_ALPHA_CEILING &&
    maxNodeSpeed(sim.nodes()) < EARLY_STOP_MAX_SPEED);

// Runs the simulation to rest, returning each tick's positions as flat
// [x0, y0, x1, y1, ...] arrays.
const settle = (sim: Simulation<SimNode, undefined>) => {
  const frames: number[][] = [];
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    sim.tick();
    frames.push(sim.nodes().flatMap((node) => [node.x ?? 0, node.y ?? 0]));
    if (isSettled(sim)) break;
  }
  return frames;
};

const worstOverlap = (frame: number[]) => {
  const diameter = (2 * options.collideRadius) / (1 + EDGE_GAP_RATIO);
  let worst = 0;
  for (let i = 0; i < frame.length; i += 2) {
    for (let j = i + 2; j < frame.length; j += 2) {
      const distance = Math.hypot(
        frame[i]! - frame[j]!,
        frame[i + 1]! - frame[j + 1]!,
      );
      worst = Math.max(worst, diameter - distance);
    }
  }
  return worst / diameter;
};

// The part of a settle worth showing: from the first tick where people no
// longer sit on top of each other, sampled at even steps of movement so the
// barely moving tail does not take up the animation.
const playbackFrames = (frames: number[][]) => {
  let first = 0;
  while (
    first < frames.length - 1 &&
    worstOverlap(frames[first]!) > PLAYBACK_MAX_OVERLAP
  ) {
    first += 1;
  }
  const kept = frames.slice(first);
  const travelled = [0];
  for (let f = 1; f < kept.length; f += 1) {
    const [previous, current] = [kept[f - 1]!, kept[f]!];
    let distance = 0;
    for (let i = 0; i < current.length; i += 2) {
      distance += Math.hypot(
        current[i]! - previous[i]!,
        current[i + 1]! - previous[i + 1]!,
      );
    }
    travelled.push(travelled[f - 1]! + distance);
  }
  const total = travelled.at(-1) ?? 0;
  if (total === 0) return [];
  // A single early tick can cover several samples' worth of movement, so
  // samples are interpolated between ticks rather than snapped to one.
  const sampled: number[][] = [];
  let f = 1;
  for (let step = 0; step <= PLAYBACK_FRAMES; step += 1) {
    const target = (total * step) / PLAYBACK_FRAMES;
    while (f < kept.length - 1 && travelled[f]! < target) f += 1;
    const [before, after] = [kept[f - 1]!, kept[f]!];
    const span = travelled[f]! - travelled[f - 1]!;
    const u = span > 0 ? (target - travelled[f - 1]!) / span : 1;
    sampled.push(
      u >= 1 ? after : before.map((v, i) => v + (after[i]! - v) * u),
    );
  }
  return sampled;
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
    postMessage({ type: 'tick', nodes: sim.nodes() });
    // Dropping alpha below alphaMin makes d3 stop the timer and fire 'end'.
    if (isSettled(sim)) sim.alpha(0);
  });
  sim.on('end', () => {
    running = false;
    postMessage({ type: 'end', nodes: sim.nodes() });
  });
  return sim;
};

const finish = (frames: number[][]) => {
  separate(simulation.nodes());
  frames.push(simulation.nodes().flatMap((node) => [node.x ?? 0, node.y ?? 0]));
  running = false;
  needsLayout = false;
  incrementalChange = false;
  for (const node of simulation.nodes()) node.placed = true;
  postMessage({
    type: 'end',
    nodes: simulation.nodes(),
    frames: playbackFrames(frames),
  });
};

const runToEnd = (alpha: number) => {
  simulation.stop();
  simulation.alpha(alpha);
  finish(settle(simulation));
};

// Settles a change while holding everyone near where they are now.
const resettle = () => {
  setAnchors(simulation);
  runToEnd(REHEAT_ALPHA);
};

// A change made while paused is settled, anchored, once the user resumes.
const markPending = () => {
  needsLayout = true;
  incrementalChange = true;
};

// A layout built from scratch keeps the best of several runs.
const layoutFromScratch = () => {
  const seed = simulation.nodes();
  const attempts = links.length > MAX_SCORED_LINKS ? 1 : LAYOUT_ATTEMPTS;
  let bestScore = Infinity;
  let bestFrames: number[][] = [];
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
    const frames = settle(candidate);
    const score = attempts === 1 ? 0 : layoutScore(candidate.nodes());
    if (score < bestScore) {
      bestScore = score;
      bestFrames = frames;
      simulation = candidate;
    }
  }
  const swaps = untangle(simulation.nodes());
  if (swaps.length > 0) {
    for (const frame of bestFrames) {
      for (const [i, j] of swaps) {
        [frame[2 * i], frame[2 * j]] = [frame[2 * j]!, frame[2 * i]!];
        [frame[2 * i + 1], frame[2 * j + 1]] = [
          frame[2 * j + 1]!,
          frame[2 * i + 1]!,
        ];
      }
    }
    simulation.alpha(UNTANGLE_ALPHA);
    bestFrames.push(...settle(simulation));
  }
  finish(bestFrames);
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
      paused = false;
      if (!needsLayout) return;

      const nodes = simulation.nodes();
      const unplaced = nodes.filter((node) => node.placed === false).length;
      if (nodes.length > 0 && unplaced === nodes.length) {
        layoutFromScratch();
      } else if (unplaced > 0 || incrementalChange) {
        resettle();
      } else {
        simulation.force('anchorX', null);
        simulation.force('anchorY', null);
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
      resettle();
      break;
    }
    case 'update_links': {
      if (!simulation) return;

      const endpoints = JSON.stringify(linkEndpoints());
      links = data.links;
      if (JSON.stringify(linkEndpoints()) === endpoints) break;
      // Which nodes are linked changes the centering and gap forces too.
      registerForces(simulation);

      if (paused) markPending();
      else resettle();
      break;
    }
    case 'update_node': {
      if (!simulation) return;

      const node = simulation.nodes().find((n) => n.nodeId === data.nodeId);
      if (!node) return;
      // When clearing fx/fy, snap x/y to the fixed position to prevent a
      // flicker as the node jumps from fx/fy to its drifted internal x/y.
      if (data.node.fx === null && node.fx != null) node.x = node.fx;
      if (data.node.fy === null && node.fy != null) node.y = node.fy;
      Object.assign(node, data.node);

      if (paused) {
        markPending();
        break;
      }
      if (data.node.fx != null || data.node.fy != null) {
        // While a node is held the layout runs live around it.
        if (!running) setAnchors(simulation);
        running = true;
        simulation.alpha(REHEAT_ALPHA).restart();
      } else {
        // Anchor at the release position, not where the drag began.
        resettle();
      }
      break;
    }
    default:
  }
}

self.onmessage = ({ data }: { data: Message }) => {
  handleMessage(data);
};
