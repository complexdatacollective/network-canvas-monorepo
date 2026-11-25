import { afterEach, describe, expect, it, vi } from 'vitest';

import { INTERACTION_SOUND_SPRITE } from '../interactionSoundSprite';
import {
  BURST_WINDOW_MS,
  createSoundEngine,
  MASTER_GAIN,
  MIN_INTERVAL_MS,
  PITCH_VARIATION,
} from '../soundEngine';
import { FakeAudioContext, settle } from './fakeAudioContext';

function setup({
  loadSprite = () => Promise.resolve(new ArrayBuffer(8)),
}: { loadSprite?: () => Promise<ArrayBuffer> } = {}) {
  const contexts: FakeAudioContext[] = [];
  const load = vi.fn(loadSprite);
  const createAudioContext = vi.fn(() => {
    const context = new FakeAudioContext();
    contexts.push(context);
    return context;
  });
  let now = 1000;
  let random = 0.5;
  const engine = createSoundEngine({
    createAudioContext,
    loadSprite: load,
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

/** Turns sound on, loads the sprite and lets the context run. */
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
  it('creates one context and loads the sprite once', async () => {
    const harness = tracked(setup());
    harness.engine.setEnabled(true);
    await settle();
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    expect(harness.createAudioContext).toHaveBeenCalledTimes(1);
    expect(harness.load).toHaveBeenCalledTimes(1);
    expect(harness.context().decodeAudioData).toHaveBeenCalledTimes(1);
    expect(harness.context().master.gain.value).toBe(MASTER_GAIN);
  });

  it('plays a sound from its place in the sprite', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.play('error');
    await settle();
    const [source] = harness.context().played;
    const { start, duration } = INTERACTION_SOUND_SPRITE.error;
    expect(source?.buffer).toBe(harness.context().decoded);
    expect(source?.started).toEqual([0, start, duration]);
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

  it('drops a sound asked for before the sprite has loaded', async () => {
    let resolveLoad: (bytes: ArrayBuffer) => void = () => undefined;
    const harness = tracked(
      setup({
        loadSprite: () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      }),
    );
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    harness.engine.play('discard');
    await settle();
    resolveLoad(new ArrayBuffer(8));
    await settle();
    expect(harness.context().played).toHaveLength(0);
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
    expect(played).toHaveLength(1);
    expect(played[0]?.started?.[1]).toBe(
      INTERACTION_SOUND_SPRITE.discard.start,
    );
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
    expect(rates[0]).toBeCloseTo(1 - PITCH_VARIATION, 6);
    expect(rates[1]).toBeCloseTo(1 + PITCH_VARIATION, 4);
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
  it('loops its span of the sprite until stopped', async () => {
    const harness = tracked(setup());
    await ready(harness);
    const stop = harness.engine.startLoop('node-linking-mode');
    const [source] = harness.context().played;
    const { start, duration } = INTERACTION_SOUND_SPRITE['node-linking-mode'];
    expect(source?.loop).toBe(true);
    expect(source?.loopStart).toBe(start);
    expect(source?.loopEnd).toBe(start + duration);
    expect(source?.started).toEqual([0, start, undefined]);
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

  it('starts when the sprite finishes loading', async () => {
    let resolveLoad: (bytes: ArrayBuffer) => void = () => undefined;
    const harness = tracked(
      setup({
        loadSprite: () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      }),
    );
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    await settle();
    harness.engine.startLoop('node-linking-mode');
    expect(harness.context().played).toHaveLength(0);

    resolveLoad(new ArrayBuffer(8));
    await settle();
    expect(playing(harness)).toHaveLength(1);
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
  it('opens a new context when turned on again, without loading the sprite again', async () => {
    const harness = tracked(setup());
    await ready(harness);
    harness.engine.dispose();
    harness.engine.setEnabled(true);
    harness.context().state = 'running';
    harness.engine.play('drop-node');
    await settle();
    expect(harness.contexts).toHaveLength(2);
    expect(harness.load).toHaveBeenCalledTimes(1);
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

describe('sound engine when the sprite fails to load', () => {
  const failingOnce = () => {
    let calls = 0;
    return () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(new ArrayBuffer(8));
    };
  };

  it('stays silent and does not try again on its own', async () => {
    const harness = tracked(setup({ loadSprite: failingOnce() }));
    await ready(harness);
    harness.engine.play('create-node');
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.context().played).toHaveLength(0);
    expect(harness.load).toHaveBeenCalledTimes(1);
  });

  it('tries again when sound is next turned on', async () => {
    const harness = tracked(setup({ loadSprite: failingOnce() }));
    await ready(harness);
    harness.engine.setEnabled(false);
    harness.engine.setEnabled(true);
    await settle();
    harness.context().state = 'running';
    harness.engine.play('create-node');
    await settle();
    expect(harness.load).toHaveBeenCalledTimes(2);
    expect(harness.context().played).toHaveLength(1);
  });

  it('tries again once, on the first gesture after the device comes online', async () => {
    const harness = tracked(
      setup({ loadSprite: () => Promise.reject(new Error('offline')) }),
    );
    await ready(harness);
    window.dispatchEvent(new Event('online'));
    expect(harness.load).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(harness.load).toHaveBeenCalledTimes(2);
  });
});
