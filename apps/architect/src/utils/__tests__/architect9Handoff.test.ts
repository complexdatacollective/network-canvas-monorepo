import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  architect9UpgradeUrl,
  deferArchitect9Navigation,
  forwardLaunchFilesToArchitect9,
  stageHandoffImport,
  subscribeArchitect9Navigation,
  takeArchitect9Navigation,
} from '../architect9Handoff';
import {
  getLaunchFiles,
  hasPendingLaunchFiles,
  takeLaunchFiles,
  takeLaunchReadFailures,
} from '../fileLaunchQueue';
import * as handoffStore from '../handoffStore';
import { reportError } from '../reportError';

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
  takeArchitect9Navigation();
  await handoffStore.pruneStaleHandoffs(Number.POSITIVE_INFINITY);
});

describe('architect9UpgradeUrl', () => {
  it('is root-absolute, outside this build’s base, and encodes the id', () => {
    expect(architect9UpgradeUrl('3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f')).toBe(
      '/?upgrade=3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f',
    );
    expect(architect9UpgradeUrl('a b')).toBe('/?upgrade=a%20b');
  });
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

describe('forwardLaunchFilesToArchitect9', () => {
  it('stages the first file for Architect 9 and asks to navigate to its import URL', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArchitect9Navigation(listener);
    const first = new File(['first'], 'first.netcanvas');

    const remaining = await forwardLaunchFilesToArchitect9([
      first,
      new File(['second'], 'second.netcanvas'),
    ]);
    unsubscribe();

    expect(remaining).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    const url = takeArchitect9Navigation();
    const key = /^\/\?import=([0-9a-f-]{36})$/.exec(url ?? '')?.[1];
    expect(key).toBeDefined();
    // Not this app's to open...
    expect(await handoffStore.takeHandoff(key ?? '', 8)).toBeNull();
    // ...but Architect 9's.
    const record = await handoffStore.takeHandoff(key ?? '', 9);
    expect(record).toMatchObject({
      kind: 'import',
      targetMajor: 9,
      fileName: 'first.netcanvas',
    });
    expect(takeArchitect9Navigation()).toBeNull();
  });

  it('opens the file here instead when it cannot be staged', async () => {
    vi.spyOn(handoffStore, 'writeHandoff').mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    );
    const file = new File(['zip'], 'study.netcanvas');

    expect(await forwardLaunchFilesToArchitect9([file])).toEqual([file]);
    expect(takeArchitect9Navigation()).toBeNull();
    expect(reportError).toHaveBeenCalled();
  });
});

describe('deferArchitect9Navigation', () => {
  it('keeps a cancelled navigation for later without asking to run it now', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArchitect9Navigation(listener);

    deferArchitect9Navigation('/?import=abc');

    expect(listener).not.toHaveBeenCalled();
    expect(takeArchitect9Navigation()).toBe('/?import=abc');
    expect(takeArchitect9Navigation()).toBeNull();
    unsubscribe();
  });
});
