import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPreviewImageLoader,
  type PreviewImageElement,
  type PreviewImageLoaderDeps,
} from '../previewImageLoader';

// A controllable stand-in for HTMLImageElement. Decode/load are driven manually
// so tests decide exactly when a frame becomes displayable.
type FakeImage = PreviewImageElement & {
  resolveDecode: () => void;
  rejectDecode: () => void;
  fireLoad: () => void;
  fireError: () => void;
};

function makeFakeImage(options: { withDecode: boolean }): FakeImage {
  let resolve: () => void = () => {};
  let reject: () => void = () => {};
  const listeners: { load: (() => void) | null; error: (() => void) | null } = {
    load: null,
    error: null,
  };
  const image: FakeImage = {
    src: '',
    complete: false,
    decode: options.withDecode
      ? () =>
          new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
          })
      : undefined,
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    resolveDecode: () => resolve(),
    rejectDecode: () => reject(),
    fireLoad: () => listeners.load?.(),
    fireError: () => listeners.error?.(),
  };
  return image;
}

type Harness = {
  deps: PreviewImageLoaderDeps;
  log: string[];
  imageAt: (index: number) => FakeImage;
  runFrame: () => void;
  pendingFrames: () => number;
};

function makeHarness(options: { withDecode: boolean }): Harness {
  const log: string[] = [];
  const images: FakeImage[] = [];
  const frames: Array<{ callback: () => void; live: boolean }> = [];
  let urlCounter = 0;

  const deps: PreviewImageLoaderDeps = {
    createObjectURL: () => {
      urlCounter += 1;
      const url = `blob:${urlCounter}`;
      log.push(`create ${url}`);
      return url;
    },
    revokeObjectURL: (url) => {
      log.push(`revoke ${url}`);
    },
    createImage: () => {
      const image = makeFakeImage({ withDecode: options.withDecode });
      images.push(image);
      return image;
    },
    scheduleFrame: (callback) => {
      frames.push({ callback, live: true });
      return frames.length;
    },
    cancelFrame: (handle) => {
      const frame = frames[handle - 1];
      if (frame) frame.live = false;
    },
  };

  return {
    deps,
    log,
    imageAt: (index) => {
      const image = images[index];
      if (!image) throw new Error(`no image created at index ${index}`);
      return image;
    },
    runFrame: () => {
      const frame = frames.find((candidate) => candidate.live);
      if (!frame) throw new Error('no live frame scheduled');
      frame.live = false;
      frame.callback();
    },
    pendingFrames: () => frames.filter((frame) => frame.live).length,
  };
}

describe('createPreviewImageLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes and decodes only the latest source of a burst (latest-wins)', async () => {
    const h = makeHarness({ withDecode: true });
    const serialize = vi.fn((source: string) => `<svg>${source}</svg>`);
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    loader.update('b');
    loader.update('c');

    // Only one frame is scheduled for the whole burst.
    expect(h.pendingFrames()).toBe(1);
    h.runFrame();

    // Serialization ran once, for the newest source.
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledWith('c');

    h.imageAt(0).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1']);
  });

  it('drops intermediate frames while a decode is in flight, then decodes the newest', async () => {
    const h = makeHarness({ withDecode: true });
    const serialize = vi.fn((source: string) => source);
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();
    expect(serialize).toHaveBeenLastCalledWith('a');

    // While 'a' decodes, three more versions arrive.
    loader.update('b');
    loader.update('c');
    loader.update('d');
    // No new frame is scheduled until the running decode settles.
    expect(h.pendingFrames()).toBe(0);

    h.imageAt(0).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1']);

    // The finished decode schedules exactly one follow-up frame for the newest.
    expect(h.pendingFrames()).toBe(1);
    h.runFrame();
    expect(serialize).toHaveBeenLastCalledWith('d');
    expect(serialize).toHaveBeenCalledTimes(2);

    h.imageAt(1).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1', 'blob:2']);
  });

  it('revokes the previous URL only after the new one is swapped in, never the active URL', async () => {
    const h = makeHarness({ withDecode: true });
    const loader = createPreviewImageLoader<string>({
      serialize: (source) => source,
      onSwap: (url) => h.log.push(`swap ${url}`),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();
    h.imageAt(0).resolveDecode();
    await Promise.resolve();

    loader.update('b');
    h.runFrame();
    h.imageAt(1).resolveDecode();
    await Promise.resolve();

    // First frame: created + swapped, nothing revoked yet (it is now on screen).
    // Second frame: swapped in before the first URL is revoked.
    expect(h.log).toEqual([
      'create blob:1',
      'swap blob:1',
      'create blob:2',
      'swap blob:2',
      'revoke blob:1',
    ]);
    // The URL currently on screen (blob:2) is never revoked.
    expect(h.log).not.toContain('revoke blob:2');
  });

  it('falls back to onload when decode rejects', async () => {
    const h = makeHarness({ withDecode: true });
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize: (source) => source,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();

    h.imageAt(0).rejectDecode();
    await Promise.resolve();
    // decode rejected and the image is not yet complete: no swap yet.
    expect(swaps).toEqual([]);

    h.imageAt(0).fireLoad();
    expect(swaps).toEqual(['blob:1']);
  });

  it('swaps on the load event when decode is unavailable (jsdom)', () => {
    const h = makeHarness({ withDecode: false });
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize: (source) => source,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();
    expect(swaps).toEqual([]);

    h.imageAt(0).fireLoad();
    expect(swaps).toEqual(['blob:1']);
  });

  it('keeps the last good frame and frees the dead URL when a frame fails to load', async () => {
    const h = makeHarness({ withDecode: true });
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize: (source) => source,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();
    h.imageAt(0).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1']);

    loader.update('b');
    h.runFrame();
    h.imageAt(1).fireError();

    // The broken frame is revoked; the good frame stays displayed.
    expect(h.log).toContain('revoke blob:2');
    expect(swaps).toEqual(['blob:1']);
    expect(h.log).not.toContain('revoke blob:1');
  });

  it('drops an in-flight decode and revokes every outstanding URL on dispose', async () => {
    const h = makeHarness({ withDecode: true });
    const swaps: string[] = [];
    const loader = createPreviewImageLoader<string>({
      serialize: (source) => source,
      onSwap: (url) => swaps.push(url),
      deps: h.deps,
    });

    loader.update('a');
    h.runFrame();
    h.imageAt(0).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1']);

    // A second frame is mid-decode when the component unmounts.
    loader.update('b');
    h.runFrame();
    loader.dispose();

    // Both the displayed URL and the in-flight URL are revoked.
    expect(h.log).toContain('revoke blob:1');
    expect(h.log).toContain('revoke blob:2');

    // A late decode resolution after dispose does not swap.
    h.imageAt(1).resolveDecode();
    await Promise.resolve();
    expect(swaps).toEqual(['blob:1']);
  });

  it('cancels a scheduled frame and ignores updates after dispose', () => {
    const h = makeHarness({ withDecode: true });
    const serialize = vi.fn((source: string) => source);
    const loader = createPreviewImageLoader<string>({
      serialize,
      onSwap: () => {},
      deps: h.deps,
    });

    loader.update('a');
    loader.dispose();
    loader.update('b');

    // The pending frame was cancelled; running it is a no-op and never serializes.
    expect(h.pendingFrames()).toBe(0);
    expect(serialize).not.toHaveBeenCalled();
  });
});
