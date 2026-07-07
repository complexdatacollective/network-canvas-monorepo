import { afterEach, describe, expect, it, vi } from 'vitest';

// The module registers the launchQueue consumer on init and holds module
// state, so load a fresh copy per test with a stubbed queue.
type Handle = { getFile: () => Promise<File> };

const loadModule = async () => {
  vi.resetModules();
  let consumer: ((params: { files: Handle[] }) => void) | undefined;
  vi.stubGlobal('launchQueue', {
    setConsumer: (fn: typeof consumer) => {
      consumer = fn;
    },
  });
  const mod = await import('../fileLaunchQueue');
  mod.initFileLaunchCapture();
  if (!consumer) throw new Error('consumer was not registered');
  const settle = async () => {
    // getFile() resolution is async; let the consumer settle.
    await Promise.resolve();
    await Promise.resolve();
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
  return { mod, launch, launchHandles };
};

afterEach(() => {
  vi.unstubAllGlobals();
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

    const taken = mod.takeLaunchFiles();
    expect(taken.map((f) => f.name)).toEqual(['a.netcanvas', 'b.netcanvas']);
    expect(mod.getLaunchFiles()).toEqual([]);
    expect(mod.takeLaunchFiles()).toEqual([]);
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
});
