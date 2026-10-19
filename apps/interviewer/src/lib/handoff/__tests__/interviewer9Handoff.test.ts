import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLaunchFailureCount,
  getLaunchFiles,
  hasPendingLaunchFiles,
  takeLaunchFailureCount,
  takeLaunchFiles,
} from '~/lib/pwa/fileLaunchQueue';

import { pruneStaleHandoffs, takeHandoff, writeHandoff } from '../handoffStore';
import {
  forwardFileToInterviewer9,
  forwardLaunchFilesToInterviewer9,
  getInterviewer9Navigation,
  stageHandoffImport,
  subscribeInterviewer9Navigation,
  takeInterviewer9Navigation,
} from '../interviewer9Handoff';
import { leaveForInterviewer9 } from '../interviewer9Navigation';

vi.mock(import('../interviewer9Navigation'), async (importOriginal) => ({
  ...(await importOriginal()),
  leaveForInterviewer9: vi.fn(),
}));

vi.mock(import('../handoffStore'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeHandoff: vi.fn(actual.writeHandoff) };
});

const IMPORT_URL = /^\/\?import=([0-9a-f-]{36})$/;

const netcanvas = (name = 'study.netcanvas') =>
  new File(['zip-bytes'], name, { type: 'application/zip' });

const untilLaunchQueueSettles = () =>
  vi.waitFor(() => {
    expect(hasPendingLaunchFiles() && getLaunchFiles().length === 0).toBe(
      false,
    );
  });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  takeLaunchFiles();
  takeLaunchFailureCount();
  takeInterviewer9Navigation();
  await pruneStaleHandoffs(Number.POSITIVE_INFINITY);
  vi.restoreAllMocks();
  vi.mocked(leaveForInterviewer9).mockClear();
});

describe('stageHandoffImport', () => {
  it('queues the file Interviewer 9 staged for this app, once', async () => {
    const key = await writeHandoff({
      targetMajor: 8,
      fileName: 'Study',
      file: netcanvas(),
    });

    stageHandoffImport(key);
    await untilLaunchQueueSettles();

    // The bytes are not compared: fake-indexeddb cannot structured-clone
    // jsdom's Blob, which a browser's IndexedDB stores as it is.
    expect(getLaunchFiles().map((f) => f.name)).toEqual(['Study.netcanvas']);
    expect(getLaunchFailureCount()).toBe(0);
    await expect(takeHandoff(key)).resolves.toBeNull();
  });

  it('keeps a name that already ends in .netcanvas', async () => {
    const key = await writeHandoff({
      targetMajor: 8,
      fileName: 'study.NETCANVAS',
      file: netcanvas(),
    });

    stageHandoffImport(key);
    await untilLaunchQueueSettles();

    expect(getLaunchFiles().map((f) => f.name)).toEqual(['study.NETCANVAS']);
  });

  it('reports a missing record, or one staged for Interviewer 9, as an unreadable launch', async () => {
    const forNine = await writeHandoff({
      targetMajor: 9,
      fileName: 'newer.netcanvas',
      file: netcanvas(),
    });

    stageHandoffImport(forNine);
    stageHandoffImport(crypto.randomUUID());
    await vi.waitFor(() => {
      expect(getLaunchFailureCount()).toBe(2);
    });

    expect(getLaunchFiles()).toEqual([]);
    // Left for its owner.
    await expect(takeHandoff(forNine, 9)).resolves.not.toBeNull();
  });
});

describe('forwardFileToInterviewer9', () => {
  it('stages the file for Interviewer 9 and leaves for its import flow', async () => {
    await expect(
      forwardFileToInterviewer9(netcanvas('newer.netcanvas')),
    ).resolves.toBe(true);

    const [url] = vi.mocked(leaveForInterviewer9).mock.calls[0] ?? [];
    const key = IMPORT_URL.exec(url ?? '')?.[1];
    expect(key).toBeDefined();
    const record = await takeHandoff(key ?? '', 9);
    expect(record).toMatchObject({
      targetMajor: 9,
      fileName: 'newer.netcanvas',
    });
  });

  it('stays here when the file cannot be staged', async () => {
    vi.mocked(writeHandoff).mockRejectedValueOnce(new Error('quota'));

    await expect(forwardFileToInterviewer9(netcanvas())).resolves.toBe(false);
    expect(leaveForInterviewer9).not.toHaveBeenCalled();
  });
});

describe('forwardLaunchFilesToInterviewer9', () => {
  it('stages a launched file and asks to leave, without leaving itself', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInterviewer9Navigation(listener);

    await expect(
      forwardLaunchFilesToInterviewer9([netcanvas('a.netcanvas')]),
    ).resolves.toEqual([]);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(leaveForInterviewer9).not.toHaveBeenCalled();
    const url = getInterviewer9Navigation();
    const key = IMPORT_URL.exec(url ?? '')?.[1];
    await expect(takeHandoff(key ?? '', 9)).resolves.toMatchObject({
      fileName: 'a.netcanvas',
    });
    expect(takeInterviewer9Navigation()).toBe(url);
    expect(takeInterviewer9Navigation()).toBeNull();
  });

  it('keeps every file of a launch of several here, rather than hand over one and drop the rest', async () => {
    const files = [netcanvas('a.netcanvas'), netcanvas('b.netcanvas')];

    await expect(forwardLaunchFilesToInterviewer9(files)).resolves.toEqual(
      files,
    );

    // Nothing staged and no request to leave, which would end this page
    // before the files could import.
    expect(writeHandoff).not.toHaveBeenCalled();
    expect(getInterviewer9Navigation()).toBeNull();
  });

  it('hands the file back to import here when it cannot be staged', async () => {
    vi.mocked(writeHandoff).mockRejectedValueOnce(new Error('quota'));
    const file = netcanvas();

    await expect(forwardLaunchFilesToInterviewer9([file])).resolves.toEqual([
      file,
    ]);
    expect(getInterviewer9Navigation()).toBeNull();
  });

  it('has nothing to do for an empty launch', async () => {
    await expect(forwardLaunchFilesToInterviewer9([])).resolves.toEqual([]);
    expect(getInterviewer9Navigation()).toBeNull();
  });
});
