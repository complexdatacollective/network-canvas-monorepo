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
// The simulation runs in PIXEL coordinates (the hook converts the authored
// normalized 0-1 positions to px before seeding). Collision is therefore
// visually isotropic: a circular collision zone renders as a circle on any
// canvas aspect ratio, so the guaranteed minimum gap between nodes holds in
// rendered pixels rather than collapsing vertically on a wide canvas.
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
  canvasWidth: number;
  canvasHeight: number;
  alphaMin: number;
  startAlpha: number;
};

const DEFAULT_OPTIONS: AutoLayoutForceOptions = {
  alphaDecay: 1 - 0.001 ** (1 / 300),
  velocityDecay: 0.3,
  // Charge is dropped (0) by default: in px space forceManyBody's effect scales
  // with absolute size and competes with collision, causing drift and uneven
  // spacing. Collision alone enforces the minimum gap; cohesion clusters.
  // forceManyBody is only registered when charge !== 0 (Sociogram supplies a
  // negative charge for repulsion).
  charge: 0,
  cohesion: 0.1,
  // collideRadius is a PIXEL center-to-center half-distance: two nodes cannot
  // settle closer than 2 * collideRadius. The hook computes this from the live
  // rendered node radius; this default mirrors the base-theme rendered size.
  collideRadius: collideRadiusForNode(FALLBACK_NODE_RADIUS),
  // Edge attraction (a gentle forceLink): connected nodes pull together so
  // topologies self-organise. linkDistance is derived from collideRadius so the
  // target spacing stays consistent with the collision guarantee — connected
  // nodes settle a little beyond touching (collision already prevents closer).
  // linkStrength is modest so links cooperate with, not overpower, cohesion.
  linkDistance: 2.4 * collideRadiusForNode(FALLBACK_NODE_RADIUS),
  linkStrength: 0.3,
  // Horizontal centering (forceX): a symmetric counterpart to the upward bias.
  // Narrative preserves authored x (biasXStrength 0, so forceX is inert), while
  // Sociogram has no authored layout and uses a weak forceX toward canvas-center
  // to keep the composition horizontally centred. biasXFraction is the target as
  // a fraction of canvas width (0.5 = center). forceX is registered only when
  // biasXStrength > 0 and canvasWidth > 0 (the target is resolvable).
  biasXFraction: 0.5,
  biasXStrength: 0,
  // Upward bias (forceY): the layout settles around canvas-center, but the
  // bottom-center legend/preset panel occludes the lowest nodes at its DEFAULT
  // position. A weak forceY toward a target above center lifts the composition
  // clear of that panel without fighting cohesion/links. biasYFraction is the
  // target as a fraction of canvas height (0 = top). forceY is registered only
  // when biasYStrength > 0 and canvasHeight > 0 (the target is resolvable).
  biasYFraction: 0.5,
  biasYStrength: 0,
  // Hard inset (px) from each canvas edge that confines node CENTERS, applied as
  // a post-collision bounds force. 0 disables it (Sociogram). The hook supplies
  // the value matching the store's drag/placement clamp so the clamp becomes a
  // no-op once the simulation settles.
  boundsInset: 0,
  // The canvas dimensions (px); the hook supplies them so the forceX/forceY
  // targets can be resolved from biasXFraction/biasYFraction. Both fall back to
  // 0 (the corresponding bias inert) until provided.
  canvasWidth: 0,
  canvasHeight: 0,
  alphaMin: 0.1,
  startAlpha: 0.4,
};

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

const cloneLinks = (ls: SimLink[]): SimLink[] =>
  ls.map((link) => ({ ...link }));

const makeLinkForce = () =>
  forceLink<SimNode, SimLink>(cloneLinks(links))
    .distance(options.linkDistance)
    .strength(options.linkStrength);

const registerForces = (sim: Simulation<SimNode, undefined>) => {
  if (options.charge !== 0) {
    sim.force('charge', forceManyBody().strength(options.charge));
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
  // Hard bounds, applied AFTER collide so collision separates pairs first and
  // bounds then confines any stray to the wall; the next tick's collide
  // re-separates along the wall. Clamping each node center into the inset box
  // and zeroing outward velocity (rather than an attractive forceX/Y toward the
  // edge) keeps nodes off the boundary without injecting energy that fights
  // cohesion. Inert unless a positive inset and resolvable canvas dimensions are
  // supplied. The closure reads sim.nodes() live so it sees pinned/updated nodes.
  if (
    options.boundsInset > 0 &&
    options.canvasWidth > 0 &&
    options.canvasHeight > 0
  ) {
    const inset = options.boundsInset;
    const maxX = options.canvasWidth - inset;
    const maxY = options.canvasHeight - inset;
    const boundsForce = () => {
      for (const n of sim.nodes()) {
        if (n.x == null || n.y == null) continue;
        if (n.x < inset) {
          n.x = inset;
          if (n.vx != null && n.vx < 0) n.vx = 0;
        } else if (n.x > maxX) {
          n.x = maxX;
          if (n.vx != null && n.vx > 0) n.vx = 0;
        }
        if (n.y < inset) {
          n.y = inset;
          if (n.vy != null && n.vy < 0) n.vy = 0;
        } else if (n.y > maxY) {
          n.y = maxY;
          if (n.vy != null && n.vy > 0) n.vy = 0;
        }
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
  // Edge attraction. The px linkDistance is derived from collideRadius so the
  // target spacing stays consistent with the collision guarantee. Registered
  // even with no links (an empty forceLink is inert).
  sim.force('link', makeLinkForce());
  // Weak horizontal bias toward a target across the canvas width (center by
  // default), to keep an unauthored layout centred. Inert unless a positive
  // strength and a resolvable target (canvas width) are both supplied.
  if (options.biasXStrength > 0 && options.canvasWidth > 0) {
    sim.force(
      'biasX',
      forceX<SimNode>(options.canvasWidth * options.biasXFraction).strength(
        options.biasXStrength,
      ),
    );
  } else {
    sim.force('biasX', null);
  }
  // Weak upward bias toward a target above center, to clear the bottom-center
  // panel. Inert unless a positive strength and a resolvable target (canvas
  // height) are both supplied.
  if (options.biasYStrength > 0 && options.canvasHeight > 0) {
    sim.force(
      'biasY',
      forceY<SimNode>(options.canvasHeight * options.biasYFraction).strength(
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

      simulation.on('tick', () => {
        postMessage({ type: 'tick', nodes: simulation.nodes() });
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
      simulation.stop();
      postMessage({ type: 'end', nodes: simulation.nodes() });
      break;
    }
    case 'reheat': {
      if (!simulation) return;
      console.debug('autolayout-worker:reheat');
      running = true;
      simulation.alpha(0.3).restart();
      break;
    }
    case 'update_links': {
      if (!simulation) return;

      links = data.links;
      // forceLink resolved its endpoints to the seeded node objects; re-register
      // with fresh index-based links so it resolves against the current nodes.
      simulation.force('link', makeLinkForce());

      // Only reheat when the simulation is actually running. When the layout is
      // paused (the user toggled it off, sending `stop`), adding or removing an
      // edge must NOT restart it — it stays paused until the user resumes.
      if (running) {
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

      if (running) {
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
