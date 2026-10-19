import { afterEach, describe, expect, it, vi } from 'vitest';

// The module registers the launchQueue consumer on init and holds module
// state, so load a fresh copy per test with a stubbed queue.
type Handle = { getFile: () => Promise<File> };

type CaptureOptions = { routeFiles?: (files: File[]) => Promise<File[]> };

const loadModule = async (options?: CaptureOptions) => {
  vi.resetModules();
  let consumer: ((params: { files: Handle[] }) => void) | undefined;
  vi.stubGlobal('launchQueue', {
    setConsumer: (fn: typeof consumer) => {
      consumer = fn;
    },
  });
  const mod = await import('../fileLaunchQueue');
  mod.initFileLaunchCapture(options);
  if (!consumer) throw new Error('consumer was not registered');
  const settle = async () => {
    // getFile() resolution is async; let the consumer settle.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const launch = async (...names: string[]) => {
    consumer?.({
      files: names.map((name) => ({
        getFile: () => Promise.resolve(new File(['zip-bytes'], name)),
      })),
    });
    await settle();
  };
  const launchHandles = async (...handles: Handle[]) => {
    consumer?.({ files: handles });
    await settle();
  };
  return { mod, launch, launchHandles, settle };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fileLaunchQueue', () => {
  it('starts empty and is a no-op without window.launchQueue', async () => {
    vi.resetModules();
    vi.stubGlobal('launchQueue', undefined);
    const mod = await import('../fileLaunchQueue');
    mod.initFileLaunchCapture();
    expect(mod.getLaunchFiles()).toEqual([]);
  });

  it('captures launched .netcanvas files and notifies subscribers', async () => {
    const { mod, launch } = await loadModule();
    const listener = vi.fn();
    mod.subscribeLaunchFiles(listener);

    await launch('study.netcanvas');

    expect(mod.getLaunchFiles().map((f) => f.name)).toEqual([
      'study.netcanvas',
    ]);
    expect(listener).toHaveBeenCalled();
  });

  it('ignores files without the .netcanvas extension', async () => {
    const { mod, launch } = await loadModule();

    await launch('notes.txt', 'study.NETCANVAS');

    expect(mod.getLaunchFiles().map((f) => f.name)).toEqual([
      'study.NETCANVAS',
    ]);
  });

  it('takeLaunchFiles hands the batch over exactly once', async () => {
    const { mod, launch } = await loadModule();
    await launch('a.netcanvas', 'b.netcanvas');

    expect(mod.hasPendingLaunchFiles()).toBe(true);
    const taken = mod.takeLaunchFiles();
    expect(taken.map((f) => f.name)).toEqual(['a.netcanvas', 'b.netcanvas']);
    expect(mod.getLaunchFiles()).toEqual([]);
    expect(mod.hasPendingLaunchFiles()).toBe(false);
    expect(mod.takeLaunchFiles()).toEqual([]);
  });

  it('reports pending launch files while OS handles are still being read', async () => {
    const { mod, launchHandles, settle } = await loadModule();
    let resolveFile: (file: File) => void = () => {};

    await launchHandles({
      getFile: () =>
        new Promise<File>((resolve) => {
          resolveFile = resolve;
        }),
    });

    expect(mod.hasPendingLaunchFiles()).toBe(true);

    resolveFile(new File(['zip'], 'pending.netcanvas'));
    await settle();

    expect(mod.getLaunchFiles().map((f) => f.name)).toEqual([
      'pending.netcanvas',
    ]);
    expect(mod.hasPendingLaunchFiles()).toBe(true);

    mod.takeLaunchFiles();
    expect(mod.hasPendingLaunchFiles()).toBe(false);
  });

  it('keeps the snapshot identity stable between changes', async () => {
    const { mod, launch } = await loadModule();
    await launch('a.netcanvas');
    const first = mod.getLaunchFiles();
    expect(mod.getLaunchFiles()).toBe(first);
    await launch('b.netcanvas');
    expect(mod.getLaunchFiles()).not.toBe(first);
  });

  it('keeps readable files when a sibling handle fails to read', async () => {
    const { mod, launchHandles } = await loadModule();

    await launchHandles(
      { getFile: () => Promise.reject(new Error('file moved')) },
      { getFile: () => Promise.resolve(new File(['zip'], 'good.netcanvas')) },
    );

    expect(mod.getLaunchFiles().map((f) => f.name)).toEqual(['good.netcanvas']);
  });

  it('records a user-facing failure count for unreadable handles', async () => {
    const { mod, launchHandles } = await loadModule();
    const listener = vi.fn();
    mod.subscribeLaunchFiles(listener);

    await launchHandles(
      { getFile: () => Promise.reject(new Error('volume unmounted')) },
      { getFile: () => Promise.reject(new Error('file deleted')) },
    );

    expect(mod.getLaunchFailureCount()).toBe(2);
    expect(listener).toHaveBeenCalled();

    const taken = mod.takeLaunchFailureCount();
    expect(taken).toBe(2);
    expect(mod.getLaunchFailureCount()).toBe(0);
    expect(mod.takeLaunchFailureCount()).toBe(0);
  });

  describe('routeFiles', () => {
    it('queues only the files it hands back, holding the update check while it runs', async () => {
      let finishRouting: (files: File[]) => void = () => {};
      const routeFiles = vi.fn(
        () =>
          new Promise<File[]>((resolve) => {
            finishRouting = resolve;
          }),
      );
      const { mod, launch, settle } = await loadModule({ routeFiles });

      await launch('a.netcanvas', 'notes.txt', 'b.netcanvas');

      expect(routeFiles).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'a.netcanvas' }),
        expect.objectContaining({ name: 'b.netcanvas' }),
      ]);
      expect(mod.getLaunchFiles()).toEqual([]);
      expect(mod.hasPendingLaunchFiles()).toBe(true);

      finishRouting([]);
      await settle();

      expect(mod.getLaunchFiles()).toEqual([]);
      expect(mod.hasPendingLaunchFiles()).toBe(false);
    });

    it('imports here whatever it hands back', async () => {
      const { mod, launch } = await loadModule({
        routeFiles: async (files) => files.slice(0, 1),
      });

      await launch('a.netcanvas', 'b.netcanvas');

      expect(mod.getLaunchFiles().map((f) => f.name)).toEqual(['a.netcanvas']);
    });
  });

  describe('enqueueLaunchRead', () => {
    it('queues the file it reads, and holds the update check until then', async () => {
      const { mod, settle } = await loadModule();
      let resolveRead: (file: File | null) => void = () => {};

      mod.enqueueLaunchRead(
        () =>
          new Promise<File | null>((resolve) => {
            resolveRead = resolve;
          }),
      );
      expect(mod.hasPendingLaunchFiles()).toBe(true);
      expect(mod.getLaunchFiles()).toEqual([]);

      resolveRead(new File(['zip'], 'staged.netcanvas'));
      await settle();

      expect(mod.getLaunchFiles().map((f) => f.name)).toEqual([
        'staged.netcanvas',
      ]);
      expect(mod.getLaunchFailureCount()).toBe(0);
    });

    it('reports nothing to read, or a failed read, as an unreadable launched file', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { mod, settle } = await loadModule();

      mod.enqueueLaunchRead(async () => null);
      mod.enqueueLaunchRead(async () => {
        throw new Error('storage unavailable');
      });
      await settle();

      expect(mod.getLaunchFiles()).toEqual([]);
      expect(mod.getLaunchFailureCount()).toBe(2);
      expect(mod.hasPendingLaunchFiles()).toBe(false);
    });
  });
});
