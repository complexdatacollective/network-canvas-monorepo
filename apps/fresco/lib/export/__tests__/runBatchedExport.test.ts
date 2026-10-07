import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => vi.restoreAllMocks());

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
    ['the same name', 'shared.txt', 'shared.txt'],
    ['names that differ only in case', 'Friend.csv', 'friend.csv'],
  ])(
    'fails, rather than keep one file and drop the other, for %s in two batches',
    async (_, first, second) => {
      const ids = Array.from(
        { length: EXPORT_BATCH_SIZE + 1 },
        (_unused, i) => `id${i}`,
      );
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(fileBatch(first, [1]))
        .mockResolvedValueOnce(fileBatch(second, [2]));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        runBatchedExport(
          ids,
          exportOptions,
          new AbortController().signal,
          () => undefined,
        ),
      ).rejects.toBeInstanceOf(DuplicateExportFileError);
    },
  );

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
