import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stageHandoffImport } from '../architect9Handoff';
import {
  getLaunchFiles,
  hasPendingLaunchFiles,
  takeLaunchFiles,
  takeLaunchReadFailures,
} from '../fileLaunchQueue';
import * as handoffStore from '../handoffStore';

vi.mock('../reportError', () => ({ reportError: vi.fn() }));

const settle = () =>
  vi.waitFor(() => {
    expect(hasPendingLaunchFiles() && getLaunchFiles().length === 0).toBe(
      false,
    );
  });

afterEach(async () => {
  vi.restoreAllMocks();
  takeLaunchFiles();
  takeLaunchReadFailures();
  await handoffStore.pruneStaleHandoffs(Number.POSITIVE_INFINITY);
});

describe('stageHandoffImport', () => {
  it('queues the staged file under its own name, and consumes the record', async () => {
    const key = await handoffStore.writeHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: new Blob(['zip-bytes'], { type: 'application/zip' }),
    });

    stageHandoffImport(key);
    await settle();

    const [file] = takeLaunchFiles();
    expect(file?.name).toBe('study.netcanvas');
    // The bytes themselves are not asserted: fake-indexeddb clones with
    // Node's structuredClone, which cannot clone jsdom's Blob. A browser's
    // IndexedDB stores Blobs natively.
    expect(await handoffStore.takeHandoff(key)).toBeNull();
    expect(takeLaunchReadFailures()).toEqual([]);
  });

  it('gives a staged file without the extension one, so Open file accepts it', async () => {
    const key = await handoffStore.writeHandoff({
      targetMajor: 8,
      fileName: 'study',
      file: new Blob(['zip-bytes']),
    });

    stageHandoffImport(key);
    await settle();

    expect(takeLaunchFiles().map((file) => file.name)).toEqual([
      'study.netcanvas',
    ]);
  });

  it('reports a missing or expired record with the unreadable-launch dialog', async () => {
    stageHandoffImport('00000000-0000-4000-8000-000000000000');
    await vi.waitFor(() => {
      expect(hasPendingLaunchFiles()).toBe(false);
    });

    expect(getLaunchFiles()).toEqual([]);
    expect(takeLaunchReadFailures()).toEqual([1]);
  });

  it('does not open a record staged for Architect 9', async () => {
    const key = await handoffStore.writeHandoff({
      targetMajor: 9,
      fileName: 'study.netcanvas',
      file: new Blob(['zip-bytes']),
    });

    stageHandoffImport(key);
    await vi.waitFor(() => {
      expect(hasPendingLaunchFiles()).toBe(false);
    });

    expect(getLaunchFiles()).toEqual([]);
    expect(takeLaunchReadFailures()).toEqual([1]);
  });
});
