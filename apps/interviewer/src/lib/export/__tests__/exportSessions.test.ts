import { afterEach, describe, expect, it, vi } from 'vitest';

import { runExport } from '../exportSessions';
import type { ExportWorkerMessage, ExportWorkerStart } from '../exportWorker';

const getSessionsByIds = vi.fn();
const getProtocolsByHashes = vi.fn();
const runPipelineWithData = vi.fn();

vi.mock('~/lib/db/api', () => ({
  getSessionsByIds: (...args: unknown[]) => getSessionsByIds(...args),
  getProtocolsByHashes: (...args: unknown[]) => getProtocolsByHashes(...args),
}));

vi.mock('../exportPipelineRunner', () => ({
  runPipelineWithData: (...args: unknown[]) => runPipelineWithData(...args),
}));

function seedDb() {
  getSessionsByIds.mockResolvedValue([
    {
      id: 's1',
      caseId: 'case-1',
      startedAt: 1722772800000,
      finishedAt: 1722776400000,
      network: { nodes: [], edges: [], ego: {} },
      protocolHash: 'hash-1',
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

  it('runs the pipeline on the main thread when Worker is unavailable', async () => {
    seedDb();
    vi.stubGlobal('Worker', undefined);
    runPipelineWithData.mockResolvedValue({
      result: {
        status: 'success',
        successfulExports: [],
        failedExports: [],
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
