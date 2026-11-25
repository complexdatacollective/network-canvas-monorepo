import { vi } from 'vitest';

import type { AudioContextLike } from '../soundEngine';

class FakeSource {
  buffer: object | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = { value: 1 };
  private readonly endedListeners: (() => void)[] = [];
  started: (number | undefined)[] | null = null;
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
  start(when?: number, offset?: number, duration?: number) {
    this.started = [when, offset, duration];
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
  state: AudioContextLike['state'] = 'suspended';
  readonly destination = {};
  readonly master = { gain: { value: 1 }, connect: () => undefined };
  readonly sources: FakeSource[] = [];
  readonly decoded = { sprite: true };
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
  decodeAudioData = vi.fn(() => Promise.resolve(this.decoded));
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

/** Lets a sprite load, and sounds gathered for one action play. */
export const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
