import { afterEach, describe, expect, it, vi } from 'vitest';

// The module registers the launchQueue consumer on init and holds module
// state, so load a fresh copy per test with a stubbed queue.
const loadModule = async () => {
  vi.resetModules();
  let consumer: ((params: { files: { getFile: () => Promise<File> }[] }) => void) | undefined;
  vi.stubGlobal('launchQueue', {
    setConsumer: (fn: typeof consumer) => {
      consumer = fn;
    },
  });
  const mod = await import('../fileLaunchQueue');
  mod.initFileLaunchCapture();
  if (!consumer) throw new Error('consumer was not registered');
  const launch = async (...names: string[]) => {
    consumer?.({
      files: names.map((name) => ({
        getFile: () => Promise.resolve(new File(['zip-bytes'], name)),
      })),
    });
    // getFile() resolution is async; let the consumer settle.
    await Promise.resolve();
    await Promise.resolve();
  };
  return { mod, launch };
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
});
