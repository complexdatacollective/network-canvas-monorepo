// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can.
const makeFile = (text: string) => new NodeBlob([text]) as unknown as Blob;

// Module state (the captured URL, the launch queue) lives per page, so each
// test loads fresh copies over one shared fake IndexedDB.
const load = async (url: string) => {
  window.history.replaceState(null, '', url);
  vi.resetModules();
  const store = await import('../handoffStore');
  const queue = await import('../../pwa/fileLaunchQueue');
  const { captureUrlEntryRequests } = await import('../urlEntryRequests');
  const { startHandedOverImport } = await import('../handedOverImport');
  return { store, queue, captureUrlEntryRequests, startHandedOverImport };
};

const settled = async (queue: { hasPendingLaunchFiles: () => boolean }) => {
  await vi.waitFor(() => {
    expect(queue.hasPendingLaunchFiles()).toBe(false);
  });
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('startHandedOverImport', () => {
  it('queues the file Interviewer 8 staged for this app, once', async () => {
    // Interviewer 8's page stages the record, then navigates here.
    const writer = await load('/');
    const key = await writer.store.stageHandoff({
      targetMajor: 9,
      fileName: 'newer.netcanvas',
      file: makeFile('zip-bytes'),
    });

    const page = await load(`/?import=${key}`);
    page.captureUrlEntryRequests();
    page.startHandedOverImport();
    // Held as a pending launch until it is read, which also holds the
    // fresh-load update that would reload this page.
    expect(page.queue.hasPendingLaunchFiles()).toBe(true);
    await vi.waitFor(() => {
      expect(page.queue.getLaunchFiles().map(({ name }) => name)).toEqual([
        'newer.netcanvas',
      ]);
    });
    expect(await page.store.takeHandoff(key)).toBeUndefined();

    // A reload of the same address finds nothing to import.
    const reload = await load(`/?import=${key}`);
    reload.captureUrlEntryRequests();
    reload.startHandedOverImport();
    await settled(reload.queue);
    expect(reload.queue.getLaunchFiles()).toEqual([]);
    expect(reload.queue.getLaunchFailureCount()).toBe(1);
  });

  it('does not take a record staged for Interviewer 8', async () => {
    const writer = await load('/');
    const key = await writer.store.stageHandoff({
      targetMajor: 8,
      fileName: 'old.netcanvas',
      file: makeFile('zip-bytes'),
    });

    const page = await load(`/?import=${key}`);
    page.captureUrlEntryRequests();
    page.startHandedOverImport();
    await settled(page.queue);

    expect(page.queue.getLaunchFiles()).toEqual([]);
    expect(page.queue.getLaunchFailureCount()).toBe(1);
    await page.store.pruneExpiredHandoffs(Number.POSITIVE_INFINITY);
  });

  it('queues nothing for an address without a hand-off', async () => {
    const page = await load('/');
    page.captureUrlEntryRequests();
    page.startHandedOverImport();
    expect(page.queue.hasPendingLaunchFiles()).toBe(false);
  });
});
