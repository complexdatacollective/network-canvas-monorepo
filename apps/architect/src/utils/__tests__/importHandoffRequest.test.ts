// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { File as NodeFile } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HANDOFF_DB_NAME } from '../handoffStore';

// The whole `/?import=<key>` path as main.tsx runs it, with the real modules:
// the address is captured, the record Architect 8 staged is taken from the
// real hand-off store, and the file lands in the real launch queue that App
// opens files from. Only `File` is Node's: jsdom's cannot hold the Blob that
// fake-indexeddb hands back, and a browser's can.

const KEY = '6f1d3c2a-9b8e-4c7d-a6f5-e4d3c2b1a098';

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can.
const makeBlob = (text: string) =>
  new NodeFile([text], 'unused') as unknown as Blob;

const load = async () => {
  vi.resetModules();
  const urlEntryRequests = await import('../urlEntryRequests');
  const handoffStore = await import('../handoffStore');
  const launchQueue = await import('../fileLaunchQueue');
  const { queueRequestedImport } = await import('../importHandoffRequest');
  return { urlEntryRequests, handoffStore, launchQueue, queueRequestedImport };
};

const deleteHandoffDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

// Writes a record the way Architect 8 does: through its own copy of the store,
// which declares the same schema.
const stage = async (
  handoffStore: Awaited<ReturnType<typeof load>>['handoffStore'],
  targetMajor: 8 | 9,
) => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(KEY);
  return await handoffStore.stageHandoff({
    targetMajor,
    file: makeBlob('PK zipped protocol'),
    fileName: 'from-architect-8.netcanvas',
  });
};

const settle = async (
  launchQueue: Awaited<ReturnType<typeof load>>['launchQueue'],
) => {
  await vi.waitFor(() =>
    expect(launchQueue.hasPendingLaunchFiles()).toBe(false),
  );
};

beforeEach(() => {
  vi.stubGlobal('File', NodeFile);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  await deleteHandoffDb();
});

describe('queueRequestedImport', () => {
  it('opens the file Architect 8 staged for this app, once, under its own name', async () => {
    const modules = await load();
    expect(await stage(modules.handoffStore, 9)).toBe(KEY);
    window.history.replaceState(null, '', `/?import=${KEY}`);

    modules.urlEntryRequests.captureUrlEntryRequests();
    expect(window.location.search).toBe('');
    modules.queueRequestedImport();
    // Counted as a pending launch at once, so the startup update holds off.
    expect(modules.launchQueue.hasPendingLaunchFiles()).toBe(true);
    await vi.waitFor(() =>
      expect(modules.launchQueue.getLaunchFiles()).toHaveLength(1),
    );

    const [file, ...rest] = modules.launchQueue.takeLaunchFiles();
    expect(rest).toEqual([]);
    expect(file?.name).toBe('from-architect-8.netcanvas');
    expect(await file?.text()).toBe('PK zipped protocol');
    expect(modules.launchQueue.takeLaunchReadFailures()).toEqual([]);
    // Taken: a second tab with the same address finds nothing.
    await expect(modules.handoffStore.takeHandoff(KEY)).resolves.toBe(
      undefined,
    );
  });

  it('leaves a record staged for Architect 8 alone and reports nothing to open', async () => {
    const modules = await load();
    await stage(modules.handoffStore, 8);
    window.history.replaceState(null, '', `/?import=${KEY}`);

    modules.urlEntryRequests.captureUrlEntryRequests();
    modules.queueRequestedImport();
    await settle(modules.launchQueue);

    expect(modules.launchQueue.getLaunchFiles()).toEqual([]);
    expect(modules.launchQueue.takeLaunchReadFailures()).toEqual([1]);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(HANDOFF_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db
          .transaction('handoffs')
          .objectStore('handoffs')
          .getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(keys).toEqual([KEY]);
    } finally {
      db.close();
    }
  });

  it('does not open a record left past its time', async () => {
    const modules = await load();
    const staleTime = Date.now() - modules.handoffStore.HANDOFF_TTL_MS - 1000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(staleTime);
    await stage(modules.handoffStore, 9);
    clock.mockRestore();
    window.history.replaceState(null, '', `/?import=${KEY}`);

    modules.urlEntryRequests.captureUrlEntryRequests();
    modules.queueRequestedImport();
    await settle(modules.launchQueue);

    expect(modules.launchQueue.getLaunchFiles()).toEqual([]);
    expect(modules.launchQueue.takeLaunchReadFailures()).toEqual([1]);
  });

  it('reports a key with no record as nothing to open', async () => {
    const modules = await load();
    window.history.replaceState(null, '', `/?import=${KEY}`);

    modules.urlEntryRequests.captureUrlEntryRequests();
    modules.queueRequestedImport();
    await settle(modules.launchQueue);

    expect(modules.launchQueue.getLaunchFiles()).toEqual([]);
    expect(modules.launchQueue.takeLaunchReadFailures()).toEqual([1]);
  });

  it('does nothing without an import request in the address', async () => {
    const modules = await load();
    window.history.replaceState(null, '', '/?import=not-a-key');

    modules.urlEntryRequests.captureUrlEntryRequests();
    modules.queueRequestedImport();

    expect(modules.launchQueue.hasPendingLaunchFiles()).toBe(false);
    expect(modules.launchQueue.takeLaunchReadFailures()).toEqual([]);
  });
});
