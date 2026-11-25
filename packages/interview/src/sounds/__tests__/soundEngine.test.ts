import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INTERACTION_SOUND_FILES,
  type InteractionSoundName,
} from '../interactionSoundFiles';
import {
  BURST_WINDOW_MS,
  createSoundEngine,
  MASTER_GAIN,
  MIN_INTERVAL_MS,
  PITCH_VARIATION,
} from '../soundEngine';
import {
  FakeAudioContext,
  settle,
  soundBytes,
  soundOf,
} from './fakeAudioContext';

type LoadSound = (name: InteractionSoundName) => Promise<ArrayBuffer>;

const ALL_SOUNDS = Object.keys(INTERACTION_SOUND_FILES).toSorted();

function setup({
  loadSound = (name) => Promise.resolve(soundBytes(name)),
}: { loadSound?: LoadSound } = {}) {
  const contexts: FakeAudioContext[] = [];
  const load = vi.fn(loadSound);
  const createAudioContext = vi.fn(() => {
    const context = new FakeAudioContext();
    contexts.push(context);
    return context;
  });
  let now = 1000;
  let random = 0.5;
  const engine = createSoundEngine({
    createAudioContext,
    loadSound: load,
    now: () => now,
    random: () => random,
    document,
    window,
  });
  return {
    engine,
    contexts,
    load,
    createAudioContext,
    context: () => {
      const context = contexts.at(-1);
      if (!context) throw new Error('No audio context was created');
      return context;
    },
    advance: (ms: number) => {
      now += ms;
    },
    setRandom: (value: number) => {
      random = value;
    },
  };
}

/** The names of the sound files that were requested, in order. */
const requested = (harness: ReturnType<typeof setup>) =>
  harness.load.mock.calls.map(([name]) => name);

/** A loader whose files arrive only when the test says so. */
function deferredLoads() {
  const waiting = new Map<InteractionSoundName, () => void>();
  const loadSound: LoadSound = (name) =>
    new Promise((resolve) => {
      waiting.set(name, () => resolve(soundBytes(name)));
    });
  const arrive = (...names: InteractionSoundName[]) => {
    for (const name of names) waiting.get(name)?.();
  };
  return {
    loadSound,
    arrive,
    arriveAll: () => arrive(...waiting.keys()),
  };
}

/** Turns sound on, loads the sound files and lets the context run. */
async function ready(harness: ReturnType<typeof setup>) {
  harness.engine.setEnabled(true);
  await settle();
  harness.context().state = 'running';
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

const engines: ReturnType<typeof setup>['engine'][] = [];
const tracked = (harness: ReturnType<typeof setup>) => {
  engines.push(harness.engine);
  return harness;
};

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  setVisibility('visible');
});

describe('sound engine while off', () => {
  it('creates no audio context and fetches nothing', async () => {
    const harness = tracked(setup());
    harness.engine.play('create-node');
    harness.engine.startLoop('node-linking-mode');
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.createAudioContext).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });
});

describe('sound engine turned on', () => {
  it('creates one context and loads each sound file once', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    // Every file is asked for at once, not one after another.
    expect(requested(harness).toSorted()).toEqual(ALL_SOUNDS);
    await settle();
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.createAudioContext).toHaveBeenCalledTimes(1);
    expect(requested(harness).toSorted()).toEqual(ALL_SOUNDS);
    expect(harness.context().decodeAudioData).toHaveBeenCalledTimes(
      ALL_SOUNDS.length,
    );
    expect(harness.context().master.gain.value).toBe(MASTER_GAIN);
  });

  it('plays a sound from the start of its own file, once', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('error');
    await settle();
    const [source] = harness.context().played;
    expect(harness.context().played.map(soundOf)).toEqual(['error']);
    expect(source?.started).toEqual({ when: 0 });
    expect(source?.loop).toBe(false);
  });

  it('resumes a suspended context on the first pointer or key press', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.context().resume).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('keydown'));
    expect(harness.context().resume).toHaveBeenCalledTimes(1);
    expect(harness.context().state).toBe('running');
  });

  it('drops a sound asked for while the context is suspended instead of playing it later', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    await settle();
    harness.engine.play('create-node');
    await settle();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.context().played).toHaveLength(0);

    harness.engine.play('create-node');
    await settle();
    expect(harness.context().played).toHaveLength(1);
  });

  it('drops a sound asked for before its file has loaded', async () => {
    const loads = deferredLoads();
    const harness = tracked(setup({ loadSound: loads.loadSound }));
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    harness.engine.play('discard');
    await settle();
    loads.arriveAll();
    await settle();
    expect(harness.context().played).toHaveLength(0);
  });

  it('plays a sound whose file has loaded while others are still loading', async () => {
    const loads = deferredLoads();
    const harness = tracked(setup({ loadSound: loads.loadSound }));
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    loads.arrive('discard');
    await settle();
    harness.engine.play('error');
    await settle();
    harness.engine.play('discard');
    await settle();
    expect(harness.context().played.map(soundOf)).toEqual(['discard']);

    loads.arrive('error');
    await settle();
    expect(harness.context().played.map(soundOf)).toEqual(['discard']);
  });

  it('plays nothing while the document is hidden', async () => {
    const harness = tracked(setup());
    await ready(harness);
    setVisibility('hidden');
    harness.engine.play('toggle-on');
    expect(harness.engine.startLoop('node-linking-mode')).toBeTypeOf(
      'function',
    );
    await settle();
    expect(harness.context().played).toHaveLength(0);
  });
});

describe('sound engine timing', () => {
  it('plays a sound repeated faster than its minimum interval once', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('create-node');
    await settle();
    harness.advance(MIN_INTERVAL_MS['create-node'] - 1);
    harness.engine.play('create-node');
    await settle();
    expect(harness.context().played).toHaveLength(1);

    harness.advance(1);
    harness.engine.play('create-node');
    await settle();
    expect(harness.context().played).toHaveLength(2);
  });

  it('plays only the most important of the sounds one action asks for', async () => {
    const harness = tracked(setup());
    await ready(harness);
    // Removing a person removes their connections first.
    harness.engine.play('toggle-off');
    harness.engine.play('toggle-off');
    harness.engine.play('discard');
    harness.engine.play('toggle-off');
    await settle();
    const { played } = harness.context();
    expect(played.map(soundOf)).toEqual(['discard']);
  });

  it('gathers the sounds asked for in later promise callbacks of the same task', async () => {
    const harness = tracked(setup());
    await ready(harness);
    // An option chosen in a field, then the connection that answer makes,
    // stored a few promise callbacks later.
    harness.engine.play('toggle-on');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    harness.engine.play('create-edge');
    await settle();
    expect(harness.context().played.map(soundOf)).toEqual(['create-edge']);
  });

  it('drops a less important sound that follows within the burst window, but not a more important one', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('create-node');
    await settle();
    harness.advance(BURST_WINDOW_MS - 1);
    harness.engine.play('create-edge');
    await settle();
    expect(harness.context().played).toHaveLength(1);

    harness.engine.play('error');
    await settle();
    expect(harness.context().played).toHaveLength(2);

    harness.advance(BURST_WINDOW_MS);
    harness.engine.play('create-edge');
    await settle();
    expect(harness.context().played).toHaveLength(3);
  });
});

describe('sound engine pitch', () => {
  it('varies a frequent sound within the pitch range', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.setRandom(0);
    harness.engine.play('toggle-on');
    await settle();
    harness.advance(1000);
    harness.setRandom(0.999_999);
    harness.engine.play('toggle-on');
    await settle();
    const rates = harness
      .context()
      .played.map((source) => source.playbackRate.value);
    // ±1.5%, about a quarter of a semitone either way.
    expect(PITCH_VARIATION).toBe(0.015);
    expect(rates[0]).toBeCloseTo(0.985, 6);
    expect(rates[1]).toBeCloseTo(1.015, 4);
  });

  it('does not vary the error or finish sounds', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.setRandom(0);
    harness.engine.play('error');
    await settle();
    harness.advance(1000);
    harness.engine.play('finish-interview');
    await settle();
    expect(
      harness.context().played.map((source) => source.playbackRate.value),
    ).toEqual([1, 1]);
  });
});

describe('sound engine looping sound', () => {
  it('loops its whole file until stopped', async () => {
    const harness = tracked(setup());
    await ready(harness);
    const stop = harness.engine.startLoop('node-linking-mode');
    const [source] = harness.context().played;
    expect(harness.context().played.map(soundOf)).toEqual([
      'node-linking-mode',
    ]);
    expect(source?.loop).toBe(true);
    expect(source?.started).toEqual({ when: 0 });
    expect(source?.playbackRate.value).toBe(1);
    stop();
    expect(source?.stopped).toBe(true);
  });

  it('stops when sound is turned off', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    harness.engine.setEnabled(false);
    expect(harness.context().played[0]?.stopped).toBe(true);
  });

  it('stops, and the context closes, when the engine is disposed', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    harness.engine.dispose();
    expect(harness.context().played[0]?.stopped).toBe(true);
    expect(harness.context().close).toHaveBeenCalledTimes(1);
  });
});

describe('sound engine looping sound that is still wanted', () => {
  // The sources that are playing, as a node that stays selected hears them.
  const playing = (harness: ReturnType<typeof setup>) =>
    harness.context().played.filter((source) => !source.stopped);

  it('stops when sound is turned off, and starts again when it is turned on', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    harness.engine.setEnabled(false);
    await settle();
    expect(playing(harness)).toHaveLength(0);

    harness.engine.setEnabled(true);
    await settle();
    expect(harness.context().played).toHaveLength(2);
    expect(playing(harness)).toHaveLength(1);
    expect(playing(harness)[0]?.loop).toBe(true);
  });

  it('starts again when sound is turned back on before the context has suspended', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    // A suspension still under way: the context is running, and says nothing.
    harness.context().suspend.mockImplementationOnce(() => Promise.resolve());
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.context().played).toHaveLength(2);
    expect(playing(harness)).toHaveLength(1);
  });

  it('starts when the page is shown', async () => {
    const harness = tracked(setup());
    await ready(harness);
    setVisibility('hidden');
    harness.engine.startLoop('node-linking-mode');
    expect(harness.context().played).toHaveLength(0);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(playing(harness)).toHaveLength(1);
  });

  it('starts when its own file finishes loading', async () => {
    const loads = deferredLoads();
    const harness = tracked(setup({ loadSound: loads.loadSound }));
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    await settle();
    harness.engine.startLoop('node-linking-mode');
    expect(harness.context().played).toHaveLength(0);

    // The other files do not start it.
    loads.arrive('create-node', 'discard', 'finish-interview');
    await settle();
    expect(harness.context().played).toHaveLength(0);

    loads.arrive('node-linking-mode');
    await settle();
    expect(playing(harness).map(soundOf)).toEqual(['node-linking-mode']);
  });

  it('starts when the context starts running', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    await settle();
    harness.engine.startLoop('node-linking-mode');
    expect(harness.context().played).toHaveLength(0);

    harness.context().state = 'running';
    await settle();
    expect(playing(harness)).toHaveLength(1);
  });

  it('does not start again once it is no longer wanted', async () => {
    const harness = tracked(setup());
    await ready(harness);
    const stop = harness.engine.startLoop('node-linking-mode');
    stop();
    expect(playing(harness)).toHaveLength(0);
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.context().played).toHaveLength(1);

    // Asked for and given up while it could not be heard.
    harness.engine.setEnabled(false);
    await settle();
    harness.engine.startLoop('node-linking-mode')();
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.context().played).toHaveLength(1);
  });

  it('plays from one source however often it becomes able to play', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    harness.context().state = 'interrupted';
    await settle();
    harness.context().state = 'running';
    await settle();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(harness.context().state).toBe('running');
    expect(harness.context().played).toHaveLength(1);
    expect(playing(harness)).toHaveLength(1);
  });
});

describe('sound engine sound in progress', () => {
  it('stops a short sound, but not the looping sound, when the page is hidden', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.startLoop('node-linking-mode');
    harness.engine.play('finish-interview');
    await settle();
    const [loop, finish] = harness.context().played;
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(finish?.stopped).toBe(true);
    expect(loop?.stopped).toBe(false);
    expect(harness.context().suspend).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(harness.context().resume).toHaveBeenCalledTimes(1);
    expect(loop?.stopped).toBe(false);
  });

  it('stops a short sound when sound is turned off', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('finish-interview');
    await settle();
    harness.engine.setEnabled(false);
    expect(harness.context().played[0]?.stopCalls).toBe(1);
  });

  it('does not stop a short sound that has already ended', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('error');
    await settle();
    const [source] = harness.context().played;
    source?.end();
    harness.engine.setEnabled(false);
    expect(source?.stopCalls).toBe(0);
  });
});

describe('sound engine after dispose', () => {
  it('opens a new context when turned on again, without loading the files again', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.dispose();
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    harness.engine.play('drop-node');
    await settle();
    expect(harness.contexts).toHaveLength(2);
    expect(harness.load).toHaveBeenCalledTimes(ALL_SOUNDS.length);
    expect(harness.context().played).toHaveLength(1);
  });

  it('stops listening to the document', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    await settle();
    harness.engine.dispose();
    document.dispatchEvent(new Event('pointerdown'));
    expect(harness.contexts[0]?.resume).not.toHaveBeenCalled();
  });
});

describe('sound engine when sound files fail to load', () => {
  // The first request for each of `names` fails; every other succeeds.
  const failingOnce = (names: readonly string[] = ALL_SOUNDS): LoadSound => {
    const failed = new Set<string>();
    return (name) => {
      if (names.includes(name) && !failed.has(name)) {
        failed.add(name);
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve(soundBytes(name));
    };
  };

  it('stays silent and does not try again on its own', async () => {
    const harness = tracked(setup({ loadSound: failingOnce() }));
    await ready(harness);
    harness.engine.play('create-node');
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.context().played).toHaveLength(0);
    expect(harness.load).toHaveBeenCalledTimes(ALL_SOUNDS.length);
  });

  it('tries again when sound is next turned on', async () => {
    const harness = tracked(setup({ loadSound: failingOnce() }));
    await ready(harness);
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    harness.context().state = 'running';
    harness.engine.play('create-node');
    await settle();
    expect(harness.load).toHaveBeenCalledTimes(2 * ALL_SOUNDS.length);
    expect(harness.context().played.map(soundOf)).toEqual(['create-node']);
  });

  it('plays the sounds whose files loaded, and tries again only the files that failed', async () => {
    const harness = tracked(setup({ loadSound: failingOnce(['create-node']) }));
    await ready(harness);
    harness.engine.play('create-node');
    await settle();
    harness.advance(1000);
    harness.engine.play('discard');
    await settle();
    expect(harness.context().played.map(soundOf)).toEqual(['discard']);

    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    expect(requested(harness).slice(ALL_SOUNDS.length)).toEqual([
      'create-node',
    ]);
    harness.advance(1000);
    harness.engine.play('create-node');
    await settle();
    expect(harness.context().played.map(soundOf)).toEqual([
      'discard',
      'create-node',
    ]);
  });

  it('tries again once, on the first gesture after the device comes online', async () => {
    const harness = tracked(
      setup({ loadSound: () => Promise.reject(new Error('offline')) }),
    );
    await ready(harness);
    window.dispatchEvent(new Event('online'));
    expect(harness.load).toHaveBeenCalledTimes(ALL_SOUNDS.length);
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.load).toHaveBeenCalledTimes(2 * ALL_SOUNDS.length);
  });
});
