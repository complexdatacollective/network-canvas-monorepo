import type * as Fflate from 'fflate';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Runs just before the archive is assembled, so a test can act while it is.
const { beforeZip } = vi.hoisted(() => ({
  beforeZip: { current: (): void => undefined },
}));

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof Fflate>();
  return {
    ...actual,
    zip: ((...args: Parameters<typeof actual.zip>) => {
      beforeZip.current();
      return actual.zip(...args);
    }) as typeof actual.zip,
  };
});

import type { ExportOptions } from '@codaco/network-exporters/options';
import type { ExportWarning } from '@codaco/network-exporters/output';
import {
  EXPORT_BATCH_RETRIES,
  EXPORT_BATCH_SIZE,
  runBatchedExport,
} from '~/lib/export/runBatchedExport';
import {
  DuplicateExportFileError,
  encodeExportEvent,
} from '~/lib/export/streamProtocol';

// A valid ExportOptions value; the actual contents are irrelevant because fetch
// is mocked (it is only JSON-serialized into the request body).
const exportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

function sseResponse(events: Parameters<typeof encodeExportEvent>[0][]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encodeExportEvent(event));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

function fileBatch(
  name: string,
  bytes: number[],
  failedSessionIds: string[] = [],
  warnings: ExportWarning[] = [],
) {
  return sseResponse([
    { type: 'file-open', name },
    { type: 'file-chunk', b64: b64(bytes) },
    { type: 'file-close' },
    { type: 'complete', failedSessionIds, warnings },
  ]);
}

const warningFor = (sessionId: string): ExportWarning => ({
  kind: 'xml-illegal-characters',
  sessionId,
  caseId: `case-${sessionId}`,
  variables: ['Nickname'],
  caseIdChanged: false,
});

afterEach(() => {
  vi.restoreAllMocks();
  beforeZip.current = () => undefined;
});

const twoBatchesOfIds = () =>
  Array.from({ length: EXPORT_BATCH_SIZE + 1 }, (_, i) => `id${i}`);

async function zipEntries(blob: Blob) {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe('runBatchedExport', () => {
  it('zips the files collected across batches', async () => {
    const ids = Array.from(
      { length: EXPORT_BATCH_SIZE + 1 },
      (_, i) => `id${i}`,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fileBatch('a.txt', [10]))
      .mockResolvedValueOnce(fileBatch('b.txt', [20]));
    vi.stubGlobal('fetch', fetchMock);

    const progress: [number, number][] = [];
    const { blob, exportedIds, failedIds } = await runBatchedExport(
      ids,
      exportOptions,
      new AbortController().signal,
      (completed, total) => progress.push([completed, total]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries).toSorted()).toEqual(['a.txt', 'b.txt']);
    expect(Array.from(entries['a.txt']!)).toEqual([10]);
    expect(Array.from(entries['b.txt']!)).toEqual([20]);
    expect(failedIds).toEqual([]);
    expect(exportedIds).toEqual(ids);
    expect(progress.at(-1)).toEqual([ids.length, ids.length]);
  });

  it('collects the warnings of every batch, in the order the batches were asked for', async () => {
    const ids = Array.from(
      { length: EXPORT_BATCH_SIZE + 1 },
      (_, i) => `id${i}`,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fileBatch('a.txt', [1], [], [warningFor('first')]))
      .mockResolvedValueOnce(
        fileBatch('b.txt', [2], [], [warningFor('second')]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { warnings } = await runBatchedExport(
      ids,
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );

    expect(warnings).toEqual([warningFor('first'), warningFor('second')]);
  });

  it('keeps one of each warning about the protocol, which every batch reports', async () => {
    const ids = Array.from(
      { length: EXPORT_BATCH_SIZE + 1 },
      (_, i) => `id${i}`,
    );
    const renamed: ExportWarning = {
      kind: 'column-renamed',
      protocolName: 'Study',
      format: 'csv',
      entity: 'node',
      entityTypeName: 'Person',
      variable: 'nodeID',
      column: 'nodeID',
      renamedTo: 'nodeID_2',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        fileBatch('a.txt', [1], [], [warningFor('first'), renamed]),
      )
      .mockResolvedValueOnce(
        fileBatch('b.txt', [2], [], [renamed, warningFor('second')]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { warnings } = await runBatchedExport(
      ids,
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );

    expect(warnings).toEqual([
      warningFor('first'),
      renamed,
      warningFor('second'),
    ]);
  });

  it('reports no warnings when no batch raised any', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fileBatch('a.txt', [1])));

    const { warnings } = await runBatchedExport(
      ['id0'],
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );

    expect(warnings).toEqual([]);
  });

  it.each([
    ['the same name', 'shared.csv', 'shared.csv', 'shared_2.csv'],
    [
      'names that differ only in case',
      'Friend.csv',
      'friend.csv',
      'friend_2.csv',
    ],
  ])(
    'keeps both files, under different names, for %s in two batches',
    async (_, first, second, renamed) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(fileBatch(first, [1]))
        .mockResolvedValueOnce(fileBatch(second, [2]));
      vi.stubGlobal('fetch', fetchMock);

      const { blob, exportedIds } = await runBatchedExport(
        twoBatchesOfIds(),
        exportOptions,
        new AbortController().signal,
        () => undefined,
      );

      const entries = await zipEntries(blob);
      expect(Object.keys(entries).toSorted()).toEqual(
        [first, renamed].toSorted(),
      );
      expect(Array.from(entries[first]!)).toEqual([1]);
      expect(Array.from(entries[renamed]!)).toEqual([2]);
      expect(exportedIds).toHaveLength(EXPORT_BATCH_SIZE + 1);
    },
  );

  it('names repeated files after the batch they were asked for in, not the one that finished first', async () => {
    let releaseFirst = (): void => undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(fileBatch('shared.csv', [1]));
          }),
      )
      .mockResolvedValueOnce(fileBatch('shared.csv', [2]));
    vi.stubGlobal('fetch', fetchMock);

    const exported = runBatchedExport(
      twoBatchesOfIds(),
      exportOptions,
      new AbortController().signal,
      (completed) => {
        // The second batch has landed; only now does the first.
        if (completed === 1) releaseFirst();
      },
    );

    const entries = await zipEntries((await exported).blob);
    expect(Array.from(entries['shared.csv']!)).toEqual([1]);
    expect(Array.from(entries['shared_2.csv']!)).toEqual([2]);
  });

  it('keeps a renamed file within the file system’s 255-byte limit', async () => {
    // A long case id fills the name; the exporter cuts it at 255 bytes.
    const longName = `${'é'.repeat(124)}_ab.csv`;
    expect(new TextEncoder().encode(longName).length).toBe(255);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fileBatch(longName, [1]))
      .mockResolvedValueOnce(fileBatch(longName, [2]));
    vi.stubGlobal('fetch', fetchMock);

    const { blob } = await runBatchedExport(
      twoBatchesOfIds(),
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );

    const names = Object.keys(await zipEntries(blob));
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
      expect(name.endsWith('.csv')).toBe(true);
    }
  });

  it('is cancelled by a cancel that arrives while the archive is being assembled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fileBatch('a.csv', [1])));
    const controller = new AbortController();
    let zipStarted = false;
    beforeZip.current = () => {
      zipStarted = true;
      controller.abort();
    };

    await expect(
      runBatchedExport(
        ['id0'],
        exportOptions,
        controller.signal,
        () => undefined,
      ),
    ).rejects.toThrow(/abort/i);
    // Cancelled during assembly, not before it.
    expect(zipStarted).toBe(true);
  });

  it('does not retry a batch that contains two files with one name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          { type: 'file-open', name: 'dup.csv' },
          { type: 'file-close' },
          { type: 'file-open', name: 'dup.csv' },
          { type: 'file-close' },
          { type: 'complete', failedSessionIds: [] },
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runBatchedExport(
        ['id0'],
        exportOptions,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(DuplicateExportFileError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a failing batch then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(fileBatch('a.txt', [7]));
    vi.stubGlobal('fetch', fetchMock);

    const { exportedIds } = await runBatchedExport(
      ['id0'],
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(exportedIds).toEqual(['id0']);
  });

  it('rejects after exhausting retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runBatchedExport(
        ['id0'],
        exportOptions,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(EXPORT_BATCH_RETRIES + 1);
  });

  it('excludes failed session ids from exportedIds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fileBatch('a.txt', [1], ['id1']));
    vi.stubGlobal('fetch', fetchMock);

    const { exportedIds, failedIds } = await runBatchedExport(
      ['id0', 'id1'],
      exportOptions,
      new AbortController().signal,
      () => undefined,
    );
    expect(failedIds).toEqual(['id1']);
    expect(exportedIds).toEqual(['id0']);
  });

  it('aborts when the signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runBatchedExport(
        ['id0'],
        exportOptions,
        controller.signal,
        () => undefined,
      ),
    ).rejects.toThrow(/abort/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
