import { afterEach, describe, expect, it, vi } from 'vitest';

import { runExport } from '../exportSessions';
import type { ExportWorkerMessage, ExportWorkerStart } from '../exportWorker';

const getSessionsForExport = vi.fn();
const getProtocolsByHashes = vi.fn();
const runPipelineWithData = vi.fn();

vi.mock('~/lib/db/api', () => ({
  getSessionsForExport: (...args: unknown[]) => getSessionsForExport(...args),
  getProtocolsByHashes: (...args: unknown[]) => getProtocolsByHashes(...args),
}));

vi.mock('../exportPipelineRunner', () => ({
  runPipelineWithData: (...args: unknown[]) => runPipelineWithData(...args),
}));

function seedDb() {
  getSessionsForExport.mockResolvedValue([
    {
      id: 's1',
      caseId: 'case-1',
      startedAt: 1722772800000,
      finishedAt: 1722776400000,
      network: { nodes: [], edges: [], ego: {} },
      protocolHash: 'hash-1',
      finishStageId: 'finish-ineligible',
      finishOutcome: 'ineligible',
    },
  ]);
  getProtocolsByHashes.mockResolvedValue([
    { hash: 'hash-1', name: 'Protocol', codebook: {} },
  ]);
}

const exportOptions = {
  exportGraphML: true,
  exportCSV: false,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 0,
    screenLayoutWidth: 0,
  },
  appVersion: 'test',
  commitHash: 'interviewer',
};

// Stands in for the export worker: captures the start message and lets tests
// drive the reply protocol.
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((message: { data: ExportWorkerMessage }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  posted: ExportWorkerStart[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: ExportWorkerStart) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  reply(message: ExportWorkerMessage) {
    this.onmessage?.({ data: message });
  }
}

describe('runExport via the export worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    FakeWorker.instances = [];
  });

  it('fetches inputs on the main thread, posts them, and resolves on done', async () => {
    seedDb();
    vi.stubGlobal('Worker', FakeWorker);
    const onEvent = vi.fn();

    const exportPromise = runExport({
      options: exportOptions,
      sessionIds: ['s1'],
      onEvent,
    });
    await vi.waitFor(() => {
      expect(FakeWorker.instances).toHaveLength(1);
      expect(FakeWorker.instances[0]?.posted).toHaveLength(1);
    });
    const worker = FakeWorker.instances[0];
    if (!worker) throw new Error('worker not constructed');

    const start = worker.posted[0];
    if (!start) throw new Error('start message not posted');
    expect(start.type).toBe('start');
    expect(start.data.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(start.data.sessions.map((s) => s.finishOutcome)).toEqual([
      'ineligible',
    ]);
    expect(Object.keys(start.data.protocols)).toEqual(['hash-1']);

    worker.reply({
      type: 'event',
      event: { type: 'stage', stage: 'generating', message: 'Generating…' },
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stage', stage: 'generating' }),
    );

    const blob = new Blob(['zip']);
    worker.reply({
      type: 'done',
      result: {
        status: 'success',
        successfulExports: [],
        failedExports: [],
        warnings: [],
        output: {},
      },
      blob,
      fileName: 'export.zip',
    });

    const run = await exportPromise;
    expect(run.blob).toBe(blob);
    expect(run.fileName).toBe('export.zip');
    expect(worker.terminated).toBe(true);
    expect(runPipelineWithData).not.toHaveBeenCalled();
  });

  it('exports a schema 8 interview with its protocol’s codebook as collected', async () => {
    const schema8Codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: { nickname: { name: 'nickname', type: 'text' } },
        },
      },
    };
    getSessionsForExport.mockResolvedValue([
      {
        id: 's8',
        caseId: 'case-8',
        startedAt: 1722772800000,
        finishedAt: 1722776400000,
        network: { nodes: [], edges: [], ego: {} },
        protocolHash: 'hash-8',
      },
    ]);
    getProtocolsByHashes.mockResolvedValue([
      {
        hash: 'hash-8',
        name: 'Schema 8 Protocol',
        schemaVersion: 8,
        codebook: schema8Codebook,
      },
    ]);
    vi.stubGlobal('Worker', FakeWorker);

    const exportPromise = runExport({
      options: exportOptions,
      sessionIds: ['s8'],
      onEvent: vi.fn(),
    });
    await vi.waitFor(() => {
      expect(FakeWorker.instances[0]?.posted).toHaveLength(1);
    });
    const worker = FakeWorker.instances[0];
    const start = worker?.posted[0];
    if (!worker || !start) throw new Error('start message not posted');

    expect(start.data.sessions).toEqual([
      expect.objectContaining({ id: 's8', finishOutcome: null }),
    ]);
    expect(start.data.protocols['hash-8']).toEqual({
      hash: 'hash-8',
      name: 'Schema 8 Protocol',
      codebook: schema8Codebook,
    });

    worker.reply({ type: 'error', message: 'stop', stack: 'Error: stop' });
    await expect(exportPromise).rejects.toThrow('stop');
  });

  it("exports each session's finish outcome, and none it did not record", async () => {
    const network = { nodes: [], edges: [], ego: {} };
    getSessionsForExport.mockResolvedValue([
      {
        id: 'recorded',
        caseId: 'case-1',
        startedAt: 1722772800000,
        finishedAt: 1722776400000,
        network,
        protocolHash: 'hash-1',
        finishStageId: 'finish-terminated',
        finishOutcome: 'terminated',
      },
      {
        // Finished before outcomes were recorded: not backfilled.
        id: 'unrecorded',
        caseId: 'case-2',
        startedAt: 1722772800000,
        finishedAt: 1722776400000,
        network,
        protocolHash: 'hash-1',
      },
      {
        id: 'unfinished',
        caseId: 'case-3',
        startedAt: 1722772800000,
        finishedAt: null,
        network,
        protocolHash: 'hash-1',
      },
    ]);
    getProtocolsByHashes.mockResolvedValue([
      { hash: 'hash-1', name: 'Protocol', codebook: {} },
    ]);
    vi.stubGlobal('Worker', FakeWorker);

    void runExport({
      options: exportOptions,
      sessionIds: ['recorded', 'unrecorded', 'unfinished'],
    }).catch(() => {});
    await vi.waitFor(() => {
      expect(FakeWorker.instances[0]?.posted).toHaveLength(1);
    });

    const start = FakeWorker.instances[0]?.posted[0];
    expect(
      start?.data.sessions.map(({ id, finishOutcome }) => [id, finishOutcome]),
    ).toEqual([
      ['recorded', 'terminated'],
      ['unrecorded', null],
      ['unfinished', null],
    ]);
  });

  it('rejects with the worker-reported error, preserving the stack', async () => {
    seedDb();
    vi.stubGlobal('Worker', FakeWorker);

    const exportPromise = runExport({
      options: exportOptions,
      sessionIds: ['s1'],
    });
    await vi.waitFor(() =>
      expect(FakeWorker.instances[0]?.posted).toHaveLength(1),
    );

    FakeWorker.instances[0]?.reply({
      type: 'error',
      message: 'zip failed',
      stack: 'Error: zip failed\n    at exportWorker',
    });

    await expect(exportPromise).rejects.toMatchObject({
      message: 'zip failed',
      stack: expect.stringContaining('at exportWorker'),
    });
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it('aborting terminates the worker and rejects as a cancellation', async () => {
    seedDb();
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();

    const exportPromise = runExport({
      options: exportOptions,
      sessionIds: ['s1'],
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(FakeWorker.instances[0]?.posted).toHaveLength(1),
    );

    controller.abort();

    await expect(exportPromise).rejects.toThrow('Export was cancelled');
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it('an already-aborted signal starts no database reads', async () => {
    seedDb();
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runExport({
        options: exportOptions,
        sessionIds: ['s1'],
        signal: controller.signal,
      }),
    ).rejects.toThrow('Export was cancelled');

    expect(getSessionsForExport).not.toHaveBeenCalled();
    expect(getProtocolsByHashes).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('aborting during the session read stops before the protocol read', async () => {
    const controller = new AbortController();
    // Cancel lands while the session read is in flight.
    getSessionsForExport.mockImplementation(() => {
      controller.abort();
      return Promise.resolve([
        {
          id: 's1',
          caseId: 'case-1',
          startedAt: 1722772800000,
          finishedAt: null,
          network: { nodes: [], edges: [], ego: {} },
          protocolHash: 'hash-1',
        },
      ]);
    });
    vi.stubGlobal('Worker', FakeWorker);

    await expect(
      runExport({
        options: exportOptions,
        sessionIds: ['s1'],
        signal: controller.signal,
      }),
    ).rejects.toThrow('Export was cancelled');

    expect(getProtocolsByHashes).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('runs the pipeline on the main thread when Worker is unavailable', async () => {
    seedDb();
    vi.stubGlobal('Worker', undefined);
    runPipelineWithData.mockResolvedValue({
      result: {
        status: 'success',
        successfulExports: [],
        failedExports: [],
        warnings: [],
        output: {},
      },
      blob: new Blob(['zip']),
      fileName: 'export.zip',
    });

    const run = await runExport({
      options: exportOptions,
      sessionIds: ['s1'],
    });

    expect(runPipelineWithData).toHaveBeenCalledOnce();
    expect(run.fileName).toBe('export.zip');
  });
});
