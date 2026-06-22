import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Sociogram automatic-layout worker drives a d3-force simulation. d3-force
// is mocked so these tests can observe whether a message reheats the simulation
// (`alpha().restart()`) without running a real, timer-driven layout. Every
// simulation method returns the simulation for chaining, mirroring d3-force.
const sim = vi.hoisted(() => {
  const simulation: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => simulation;
  simulation.alpha = vi.fn(chain);
  simulation.restart = vi.fn(chain);
  simulation.stop = vi.fn(chain);
  simulation.alphaDecay = vi.fn(chain);
  simulation.velocityDecay = vi.fn(chain);
  simulation.force = vi.fn(chain);
  simulation.on = vi.fn(chain);
  simulation.nodes = vi.fn((arg?: unknown) =>
    arg === undefined ? [] : simulation,
  );

  const makeForce = () => {
    const force: Record<string, ReturnType<typeof vi.fn>> = {};
    const ret = () => force;
    force.distance = vi.fn(ret);
    force.strength = vi.fn(ret);
    force.radius = vi.fn(ret);
    return force;
  };

  return { simulation, makeForce };
});

vi.mock('d3-force', () => ({
  forceSimulation: vi.fn(() => sim.simulation),
  forceLink: vi.fn(() => sim.makeForce()),
  forceManyBody: vi.fn(() => sim.makeForce()),
  forceX: vi.fn(() => sim.makeForce()),
  forceY: vi.fn(() => sim.makeForce()),
  forceCollide: vi.fn(() => sim.makeForce()),
}));

import { handleMessage } from '../forceSimulation.worker';

const NETWORK = {
  nodes: [
    { nodeId: 'a', x: 0, y: 0 },
    { nodeId: 'b', x: 10, y: 10 },
  ],
  links: [],
};

// A newly-added edge between the two nodes.
const NEW_EDGE = [{ source: 0, target: 1 }];

beforeEach(() => {
  // The worker posts an 'end' message on `stop`; stub the worker-global
  // postMessage so those posts don't reach jsdom's window.postMessage.
  vi.stubGlobal('postMessage', vi.fn());
  handleMessage({ type: 'initialize', network: NETWORK });
  vi.clearAllMocks();
});

describe('forceSimulation worker — pausing automatic layout', () => {
  it('does not reheat the layout when an edge changes while paused', () => {
    // User toggled "Pause Auto Layout" -> the hook sends `stop`.
    handleMessage({ type: 'stop' });
    vi.clearAllMocks();

    // An edge is added (or removed) while automatic layout is paused.
    handleMessage({ type: 'update_links', links: NEW_EDGE });

    // The link force is still updated so the graph stays consistent for when
    // the user later resumes...
    expect(sim.simulation.force).toHaveBeenCalledWith(
      'links',
      expect.anything(),
    );
    // ...but the layout is NOT restarted: it stays paused until resumed.
    expect(sim.simulation.restart).not.toHaveBeenCalled();
  });

  it('reheats the layout when an edge changes while running', () => {
    // Automatic layout is active -> the hook sends `start`.
    handleMessage({ type: 'start' });
    vi.clearAllMocks();

    handleMessage({ type: 'update_links', links: NEW_EDGE });

    // While running, an edge change reheats the layout as before.
    expect(sim.simulation.alpha).toHaveBeenCalledWith(0.3);
    expect(sim.simulation.restart).toHaveBeenCalled();
  });
});
