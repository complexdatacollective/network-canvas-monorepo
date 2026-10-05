import { describe, expect, it } from 'vitest';

import {
  consumeBatchStream,
  decodeBase64Chunk,
  DuplicateExportFileError,
  encodeExportEvent,
  type ExportStreamEvent,
  parseExportEventBuffer,
} from '~/lib/export/streamProtocol';

const decoder = new TextDecoder();

function streamOf(events: ExportStreamEvent[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encodeExportEvent(event));
      controller.close();
    },
  });
}

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('encodeExportEvent', () => {
  it('encodes an event as a single SSE data frame', () => {
    const bytes = encodeExportEvent({
      type: 'progress',
      stage: 'generating',
      current: 5,
      total: 10,
    });
    expect(decoder.decode(bytes)).toBe(
      'data: {"type":"progress","stage":"generating","current":5,"total":10}\n\n',
    );
  });
});

describe('parseExportEventBuffer', () => {
  it('parses whole frames and returns the trailing partial', () => {
    const buffer =
      'data: {"type":"stage","stage":"generating","message":"x"}\n\n' +
      'data: {"type":"file-open","name":"a.csv"}\n\n' +
      'data: {"type":"progr';
    const { events, rest } = parseExportEventBuffer(buffer);
    expect(events).toEqual([
      { type: 'stage', stage: 'generating', message: 'x' },
      { type: 'file-open', name: 'a.csv' },
    ]);
    expect(rest).toBe('data: {"type":"progr');
  });

  it('returns no events for an empty buffer', () => {
    expect(parseExportEventBuffer('')).toEqual({ events: [], rest: '' });
  });
});

describe('decodeBase64Chunk', () => {
  it('round-trips bytes encoded by encodeExportEvent data frames', () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(
      Array.from(decodeBase64Chunk(b64([0, 1, 2, 253, 254, 255]))),
    ).toEqual(Array.from(original));
  });
});

describe('consumeBatchStream', () => {
  it('reassembles file entries and returns them with no failures', async () => {
    const result = await consumeBatchStream(
      streamOf([
        { type: 'file-open', name: 'a.csv' },
        { type: 'file-chunk', b64: b64([1, 2]) },
        { type: 'file-chunk', b64: b64([3]) },
        { type: 'file-close' },
        { type: 'complete', failedSessionIds: [] },
      ]),
      () => undefined,
    );
    expect([...result.files.keys()]).toEqual(['a.csv']);
    expect(Array.from(result.files.get('a.csv')!)).toEqual([1, 2, 3]);
    expect(result.failedSessionIds).toEqual([]);
  });

  it('returns failedSessionIds from the complete event', async () => {
    const result = await consumeBatchStream(
      streamOf([{ type: 'complete', failedSessionIds: ['s1', 's2'] }]),
      () => undefined,
    );
    expect(result.failedSessionIds).toEqual(['s1', 's2']);
  });

  it('returns the warnings from the complete event', async () => {
    const warning = {
      kind: 'xml-illegal-characters',
      sessionId: 's1',
      caseId: 'P-7',
      variables: ['Nickname'],
      caseIdChanged: true,
    } as const;
    const result = await consumeBatchStream(
      streamOf([{ type: 'complete', warnings: [warning] }]),
      () => undefined,
    );
    expect(result.warnings).toEqual([warning]);
  });

  it('returns every kind of warning from the complete event', async () => {
    const warnings = [
      {
        kind: 'xml-illegal-characters-in-protocol',
        protocolName: 'Study',
        text: 'node-type-name',
        name: 'Person',
        removed: ['U+0001'],
      },
      {
        kind: 'column-renamed',
        protocolName: 'Study',
        format: 'csv',
        entity: 'node',
        entityTypeName: 'Person',
        variable: 'nodeID',
        column: 'nodeID',
        renamedTo: 'nodeID_2',
      },
      {
        kind: 'column-renamed',
        protocolName: 'Study',
        format: 'graphml',
        entity: 'ego',
        variable: 'label',
        column: 'label',
        renamedTo: 'label_2',
      },
    ] as const;
    const result = await consumeBatchStream(
      streamOf([{ type: 'complete', warnings: [...warnings] }]),
      () => undefined,
    );
    expect(result.warnings).toEqual(warnings);
  });

  it('returns no warnings when the complete event has none', async () => {
    const result = await consumeBatchStream(
      streamOf([{ type: 'complete', failedSessionIds: [] }]),
      () => undefined,
    );
    expect(result.warnings).toEqual([]);
  });

  it('ignores a complete event whose warnings are malformed, rather than guess', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'complete', warnings: [{ sessionId: 1 }] })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    await expect(consumeBatchStream(body, () => undefined)).rejects.toThrow(
      'interrupted',
    );
  });

  it('reports progress events', async () => {
    const progress: ExportStreamEvent[] = [];
    await consumeBatchStream(
      streamOf([
        { type: 'progress', stage: 'generating', current: 1, total: 2 },
        { type: 'complete', failedSessionIds: [] },
      ]),
      (event) => progress.push(event),
    );
    expect(progress).toEqual([
      { type: 'progress', stage: 'generating', current: 1, total: 2 },
    ]);
  });

  it('throws when the stream ends without a complete event', async () => {
    await expect(
      consumeBatchStream(
        streamOf([
          { type: 'file-open', name: 'a.csv' },
          { type: 'file-chunk', b64: b64([1]) },
          { type: 'file-close' },
        ]),
        () => undefined,
      ),
    ).rejects.toThrow(/interrupted/i);
  });

  it('throws the server message on an error event', async () => {
    await expect(
      consumeBatchStream(
        streamOf([{ type: 'error', message: 'boom' }]),
        () => undefined,
      ),
    ).rejects.toThrow('boom');
  });

  it('throws on a file-chunk with no open file', async () => {
    await expect(
      consumeBatchStream(
        streamOf([{ type: 'file-chunk', b64: b64([1]) }]),
        () => undefined,
      ),
    ).rejects.toThrow(/file-open/);
  });

  it('throws on file-open before the previous file is closed', async () => {
    await expect(
      consumeBatchStream(
        streamOf([
          { type: 'file-open', name: 'a.csv' },
          { type: 'file-open', name: 'b.csv' },
        ]),
        () => undefined,
      ),
    ).rejects.toThrow(/before the previous file was closed/);
  });

  it('throws when complete arrives with a file still open', async () => {
    await expect(
      consumeBatchStream(
        streamOf([
          { type: 'file-open', name: 'a.csv' },
          { type: 'file-chunk', b64: b64([1]) },
          { type: 'complete', failedSessionIds: [] },
        ]),
        () => undefined,
      ),
    ).rejects.toThrow(/unfinished file/);
  });

  it.each([
    ['the same name', 'friend.csv', 'friend.csv'],
    ['names that differ only in case', 'Friend.csv', 'friend.csv'],
    [
      'names that differ only in Unicode normalization',
      'caf\u00e9.csv',
      'cafe\u0301.csv',
    ],
  ])(
    'throws, rather than overwrite a file, for %s',
    async (_, first, second) => {
      const consumed = consumeBatchStream(
        streamOf([
          { type: 'file-open', name: first },
          { type: 'file-chunk', b64: b64([1]) },
          { type: 'file-close' },
          { type: 'file-open', name: second },
          { type: 'file-chunk', b64: b64([2]) },
          { type: 'file-close' },
          { type: 'complete', failedSessionIds: [] },
        ]),
        () => undefined,
      );

      await expect(consumed).rejects.toBeInstanceOf(DuplicateExportFileError);
      await expect(consumed).rejects.toMatchObject({ fileName: second });
    },
  );

  it('accepts files whose names are different, however alike', async () => {
    const result = await consumeBatchStream(
      streamOf([
        { type: 'file-open', name: 'close-friend.csv' },
        { type: 'file-close' },
        { type: 'file-open', name: 'close.friend.csv' },
        { type: 'file-close' },
        { type: 'file-open', name: '友人.csv' },
        { type: 'file-close' },
        { type: 'file-open', name: '家族.csv' },
        { type: 'file-close' },
        { type: 'complete', failedSessionIds: [] },
      ]),
      () => undefined,
    );

    expect([...result.files.keys()]).toEqual([
      'close-friend.csv',
      'close.friend.csv',
      '友人.csv',
      '家族.csv',
    ]);
  });
});
