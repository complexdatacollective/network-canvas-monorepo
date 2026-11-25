import { vi } from 'vitest';

import { INTERACTION_SOUND_FILES } from '../interactionSoundFiles';
import { type AudioContextLike, PITCH_VARIATION } from '../soundEngine';

/**
 * The name of a sound file (`create-edge` for `…/create-edge.mp3`), or an
 * empty string for a URL that is not a sound file's.
 */
export const fileNameOf = (url: string): string =>
  /\/([^/]+)\.mp3$/.exec(url)?.[1] ?? '';

/** The name of every sound file, once each, sorted. */
export const SOUND_FILE_NAMES: readonly string[] = [
  ...new Set(
    Object.values(INTERACTION_SOUND_FILES).map((sound) =>
      fileNameOf(sound.url),
    ),
  ),
].toSorted();

/** The bytes a test serves for a sound file; the fake decodes the name. */
export const soundBytes = (fileName: string): ArrayBuffer =>
  new TextEncoder().encode(fileName).buffer;

/** The bytes a test serves for the sound file at `url`. */
export const fileBytes = (url: string): ArrayBuffer =>
  soundBytes(fileNameOf(url));

/** What the fake decodes a sound's file to. */
class FakeBuffer {
  readonly sound: string;
  constructor(sound: string) {
    this.sound = sound;
  }
}

class FakeSource {
  buffer: object | null = null;
  loop = false;
  readonly playbackRate = { value: 1 };
  private readonly endedListeners: (() => void)[] = [];
  /** The `when` that `start` was called with, or null if it was not. */
  started: { when: number | undefined } | null = null;
  stopped = false;
  /** How many times `stop` was called. */
  stopCalls = 0;
  addEventListener(_type: 'ended', listener: () => void) {
    this.endedListeners.push(listener);
  }
  connect() {
    return undefined;
  }
  disconnect() {}
  start(when?: number) {
    this.started = { when };
  }
  stop() {
    this.stopped = true;
    this.stopCalls += 1;
  }
  /** Reaches the end of the sound on its own. */
  end() {
    for (const listener of this.endedListeners.splice(0)) listener();
  }
}

export class FakeAudioContext implements AudioContextLike {
  private currentState: AudioContextLike['state'] = 'suspended';
  private readonly stateListeners = new Set<() => void>();
  /**
   * Like a real context, a change of state is announced by a `statechange`
   * event that is queued rather than dispatched at once.
   */
  get state() {
    return this.currentState;
  }
  set state(next: AudioContextLike['state']) {
    if (next === this.currentState) return;
    this.currentState = next;
    queueMicrotask(() => {
      for (const listener of this.stateListeners) listener();
    });
  }
  addEventListener(_type: 'statechange', listener: () => void) {
    this.stateListeners.add(listener);
  }
  removeEventListener(_type: 'statechange', listener: () => void) {
    this.stateListeners.delete(listener);
  }
  readonly destination = {};
  readonly master = { gain: { value: 1 }, connect: () => undefined };
  readonly sources: FakeSource[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  decodeAudioData = vi.fn((data: ArrayBuffer) =>
    Promise.resolve(new FakeBuffer(new TextDecoder().decode(data))),
  );
  createGain() {
    return this.master;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  /** The sources that were started. */
  get played() {
    return this.sources.filter((source) => source.started !== null);
  }
}

/**
 * The sound a source plays, known by its file and its rate: two sounds may
 * play one file, each at its own rate, which pitch variation moves by at
 * most `PITCH_VARIATION` of it. A source that is no sound's is described by
 * its file and rate instead.
 */
export const soundOf = (source: {
  buffer: object | null;
  playbackRate: { value: number };
}): string | undefined => {
  if (!(source.buffer instanceof FakeBuffer)) return undefined;
  const file = source.buffer.sound;
  const rate = source.playbackRate.value;
  const matches = Object.entries(INTERACTION_SOUND_FILES).filter(
    ([, sound]) => {
      const baseRate = 'rate' in sound ? sound.rate : 1;
      return (
        fileNameOf(sound.url) === file &&
        Math.abs(rate / baseRate - 1) <= PITCH_VARIATION + 1e-9
      );
    },
  );
  const [match] = matches;
  return matches.length === 1 && match ? match[0] : `${file} at ${rate}`;
};

/** Lets the sound files load, and sounds gathered for one action play. */
export const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
