/* eslint-disable no-console */
// Shared, options-driven force-layout worker for the canvas auto-layout engine.
//
// One worker serves both the Narrative interface (run-once, seeded refinement
// with group cohesion + edge attraction + an upward bias) and the Sociogram
// interface (continuous, user-toggleable layout with charge + edge links). The
// active forces are chosen entirely from the `initialize` options, so the same
// worker expresses both behaviours without a fork. The worker has no persistence
// concept at all — it only postMessages positions; nothing here writes node
// attributes.
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
import { collideRadiusForNode, FALLBACK_NODE_RADIUS } from './layoutGeometry';

export type AutoLayoutForceOptions = {
  alphaDecay: number;
  velocityDecay: number;
  charge: number;
  cohesion: number;
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

// Sim-space collision radius derived from the FALLBACK node radius on a typical
// ~800px-tall canvas (collideRadiusForNode(48) / 800 ≈ 0.084). Only used to seed
// the linkDistance default; the hook always overrides collideRadius with the live
// measured value divided by the canvas height.
const FALLBACK_SIM_COLLIDE_RADIUS =
  collideRadiusForNode(FALLBACK_NODE_RADIUS) / 800;

const DEFAULT_OPTIONS: AutoLayoutForceOptions = {
  alphaDecay: 1 - 0.001 ** (1 / 300),
  velocityDecay: 0.3,
  // Charge is dropped (0) by default: forceManyBody competes with collision,
  // causing drift and uneven spacing. Collision alone enforces the minimum gap;
  // cohesion clusters. forceManyBody is only registered when charge !== 0
  // (Sociogram supplies a negative charge for repulsion).
  charge: 0,
  cohesion: 0.1,
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
  // ones). The hook recomputes this from the live collide radius. Tune visually.
  linkDistance: 1.9 * FALLBACK_SIM_COLLIDE_RADIUS,
  // Firm enough that connected nodes reach the collision floor during the anneal
  // and stay pressed there against charge, giving connected pairs a visibly
  // tighter spacing than the charge-spread unconnected pairs.
  linkStrength: 0.5,
  // Horizontal centering (forceX): a symmetric counterpart to the upward bias.
  // Narrative preserves authored x (biasXStrength 0, so forceX is inert), while
  // Sociogram has no authored layout and uses a weak forceX toward sim-center to
  // keep the composition horizontally centred. biasXFraction is the target as a
  // fraction of the sim width (0.5 = center). forceX is registered only when
  // biasXStrength > 0 and simWidth > 0 (the target is resolvable).
  biasXFraction: 0.5,
  biasXStrength: 0,
  // Upward bias (forceY): the layout settles around center, but the
  // bottom-center legend/preset panel occludes the lowest nodes at its DEFAULT
  // position. A weak forceY toward a target above center lifts the composition
  // clear of that panel without fighting cohesion/links. biasYFraction is the
  // target as a fraction of the sim height (0 = top). forceY is registered only
  // when biasYStrength > 0 and simHeight > 0 (the target is resolvable).
  biasYFraction: 0.5,
  biasYStrength: 0,
  // Hard inset (sim units) from each edge that confines node CENTERS, applied as
  // a post-collision bounds force. 0 disables it (Sociogram). The hook supplies
  // the value matching the store's drag/placement clamp (px inset / canvas
  // height) so the clamp becomes a no-op once the simulation settles.
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
  startAlpha: 0.4,
};

// Per-node speed (sim units / tick) below which — for ALL nodes — the layout is
// considered visually settled and the simulation is stopped early, cutting the
// long low-alpha anneal tail (FIX 2). Sim coordinates span ~[0, 1.x], so this is
// a tiny fraction of the canvas per tick. Tune visually.
const EARLY_STOP_MAX_SPEED = 0.0008;

type SimNode = SimulationNodeDatum & {
  nodeId?: string;
  groupKeys?: VariableOptionValue[];
};

// Link endpoints arrive as INDICES into the seeded node array (d3 forceLink's
// index form); forceLink mutates link objects in place, so each registration
// gets a fresh clone.
type SimLink = SimulationLinkDatum<SimNode>;

let simulation: Simulation<SimNode, undefined>;
let links: SimLink[] = [];
let options: AutoLayoutForceOptions = { ...DEFAULT_OPTIONS };
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

// Reference node count for the size-independent charge normalisation. The
// per-node repulsion is scaled by CHARGE_NORM_NODES / N for ALL N (see
// registerForces), so the summed outward force a node feels — and therefore the
// settled spread and its balance against the centering force — is the same
// regardless of network size. A fixed per-node charge would instead make that
// summed force grow ~linearly with N, so larger networks would spread further
// (and pin to the bounds) than small ones; that size-dependent behaviour is
// exactly what this removes. At N = CHARGE_NORM_NODES the supplied `charge` is
// used unscaled, so the only thing this constant fixes is the absolute spread,
// which is set by the product `charge * CHARGE_NORM_NODES`.
const CHARGE_NORM_NODES = 10;

const cloneLinks = (ls: SimLink[]): SimLink[] =>
  ls.map((link) => ({ ...link }));

const makeLinkForce = () =>
  forceLink<SimNode, SimLink>(cloneLinks(links))
    .distance(options.linkDistance)
    .strength(options.linkStrength);

const registerForces = (sim: Simulation<SimNode, undefined>) => {
  if (options.charge !== 0) {
    // Scale by CHARGE_NORM_NODES / N for every N so the layout's spread is
    // independent of network size (see CHARGE_NORM_NODES). Guard against an
    // empty seed so the divisor is never 0.
    const nodeCount = Math.max(sim.nodes().length, 1);
    sim.force(
      'charge',
      forceManyBody().strength(
        (options.charge * CHARGE_NORM_NODES) / nodeCount,
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
  // Group cohesion is always registered; it is inert when no node carries
  // groupKeys (Sociogram passes no groupVariable, so every node's groupKeys is
  // empty and no bucket survives the singleton drop).
  sim.force('group', forceGroupCohesion<SimNode>().strength(options.cohesion));
  // Edge attraction. The sim-space linkDistance is derived from collideRadius so
  // the target spacing stays consistent with the collision guarantee. Registered
  // even with no links (an empty forceLink is inert).
  sim.force('link', makeLinkForce());
  // Weak horizontal bias toward a target across the sim width (center by
  // default), to keep an unauthored layout centred. Inert unless a positive
  // strength and a resolvable target (sim width) are both supplied.
  if (options.biasXStrength > 0 && options.simWidth > 0) {
    sim.force(
      'biasX',
      forceX<SimNode>(options.simWidth * options.biasXFraction).strength(
        options.biasXStrength,
      ),
    );
  } else {
    sim.force('biasX', null);
  }
  // Weak upward bias toward a target above center, to clear the bottom-center
  // panel. Inert unless a positive strength and a resolvable target (sim height)
  // are both supplied.
  if (options.biasYStrength > 0 && options.simHeight > 0) {
    sim.force(
      'biasY',
      forceY<SimNode>(options.simHeight * options.biasYFraction).strength(
        options.biasYStrength,
      ),
    );
  } else {
    sim.force('biasY', null);
  }
};

type InitializeMessage = {
  type: 'initialize';
  nodes: SimNode[];
  links?: SimLink[];
  options?: Partial<AutoLayoutForceOptions>;
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

export function handleMessage(data: Message) {
  switch (data.type) {
    case 'initialize': {
      console.debug('autolayout-worker:initialize', data.nodes.length, 'nodes');

      options = { ...DEFAULT_OPTIONS, ...data.options };
      links = data.links ?? [];

      simulation = forceSimulation(data.nodes);
      simulation.velocityDecay(options.velocityDecay);
      simulation.alphaDecay(options.alphaDecay);
      simulation.alphaMin(options.alphaMin);
      registerForces(simulation);

      // Seed only — do not auto-run. The `start` message kicks off the gentle
      // refinement pass.
      simulation.alpha(0).stop();
      running = false;
      paused = false;

      simulation.on('tick', () => {
        const simNodes = simulation.nodes();
        postMessage({ type: 'tick', nodes: simNodes });

        // Velocity-based early stop (FIX 2): once the layout has cooled past the
        // alpha ceiling, stop as soon as every node's speed drops below the
        // threshold rather than grinding out the long low-alpha tail. d3's stop()
        // does NOT dispatch 'end', so post the settled positions explicitly.
        if (
          running &&
          simulation.alpha() < EARLY_STOP_ALPHA_CEILING &&
          maxNodeSpeed(simNodes) < EARLY_STOP_MAX_SPEED
        ) {
          running = false;
          simulation.stop();
          postMessage({ type: 'end', nodes: simNodes });
        }
      });

      simulation.on('end', () => {
        console.debug('autolayout-worker:end');
        postMessage({ type: 'end', nodes: simulation.nodes() });
      });
      break;
    }
    case 'start': {
      if (!simulation) return;
      console.debug('autolayout-worker:start');
      running = true;
      paused = false;
      // Gentle start: refine the seeded layout rather than relaying out from
      // scratch. Continuous consumers (Sociogram) supply a higher startAlpha to
      // run a full layout.
      simulation.alpha(options.startAlpha).restart();
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
      running = true;
      paused = false;
      simulation.alpha(0.3).restart();
      break;
    }
    case 'update_links': {
      if (!simulation) return;

      links = data.links;
      // forceLink resolved its endpoints to the seeded node objects; re-register
      // with fresh index-based links so it resolves against the current nodes.
      simulation.force('link', makeLinkForce());

      // Reheat unless the user has paused the layout: an edge change after a
      // natural settle should re-settle the graph, but must NOT resurrect a
      // sim the user explicitly toggled off (it stays paused until they resume).
      if (!paused) {
        running = true;
        simulation.alpha(0.3).restart();
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

      // Reheat unless paused, so dragging a node re-triggers the layout even
      // after it has settled (the "drag doesn't retrigger the layout" bug); a
      // sim the user paused stays put.
      if (!paused) {
        running = true;
        simulation.alpha(0.3).restart();
      }
      break;
    }
    default:
  }
}

self.onmessage = ({ data }: { data: Message }) => {
  handleMessage(data);
};
