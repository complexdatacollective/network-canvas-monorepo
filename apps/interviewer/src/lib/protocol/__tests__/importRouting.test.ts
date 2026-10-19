// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pruneExpiredHandoffs,
  type HandoffRecord,
} from '../../handoff/handoffStore';
import { interviewer8ImportUrl, keepOnInterviewer8 } from '../importRouting';

const { stageHandoffSpy } = vi.hoisted(() => ({
  stageHandoffSpy: vi.fn<(input: unknown) => Promise<string> | undefined>(),
}));
vi.mock('../../handoff/handoffStore', async () => {
  const actual = await vi.importActual<
    typeof import('../../handoff/handoffStore')
  >('../../handoff/handoffStore');
  return {
    ...actual,
    stageHandoff: (input: Parameters<typeof actual.stageHandoff>[0]) =>
      stageHandoffSpy(input) ?? actual.stageHandoff(input),
  };
});

const readStaged = async (key: string): Promise<HandoffRecord | undefined> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('InterviewerHandoffDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('handoffs', 'readonly')
        .objectStore('handoffs')
        .get(key);
      request.onsuccess = () =>
        resolve(request.result as HandoffRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

afterEach(async () => {
  stageHandoffSpy.mockReset();
  await pruneExpiredHandoffs(Number.POSITIVE_INFINITY);
});

describe('keepOnInterviewer8', () => {
  it('stages the file for Interviewer 8, then goes to /v8/?import=<key>', async () => {
    // jsdom's File cannot cross fake-indexeddb's structured clone; Node's
    // Blob can, and stands in for what a browser stores.
    const file = Object.assign(new NodeBlob(['zip-bytes']), {
      name: 'older.netcanvas',
    }) as unknown as File;
    const navigate = vi.fn();

    expect(await keepOnInterviewer8(file, navigate)).toEqual({ ok: true });

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(String(navigate.mock.calls[0]?.[0]), 'https://x.test');
    expect(url.pathname).toBe('/v8/');
    const key = url.searchParams.get('import') ?? '';
    expect(await readStaged(key)).toMatchObject({
      key,
      kind: 'import',
      targetMajor: 8,
      fileName: 'older.netcanvas',
    });
  });

  it('stays, with the error, when the file cannot be staged', async () => {
    const failure = new Error('quota');
    stageHandoffSpy.mockReturnValueOnce(Promise.reject(failure));
    const navigate = vi.fn();

    expect(
      await keepOnInterviewer8(new File(['zip'], 'older.netcanvas'), navigate),
    ).toEqual({ ok: false, error: failure });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('interviewer8ImportUrl', () => {
  it('addresses Interviewer 8 under its base path', () => {
    expect(interviewer8ImportUrl('5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11')).toBe(
      '/v8/?import=5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11',
    );
  });
});
