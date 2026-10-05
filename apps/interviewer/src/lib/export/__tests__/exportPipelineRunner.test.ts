import { Effect, Queue } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { ExportEvent } from '@codaco/network-exporters/events';
import type { InterviewExportInput } from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type { ExportReturn } from '@codaco/network-exporters/output';

import { runPipelineWithData } from '../exportPipelineRunner';

const pipelineResult: ExportReturn = {
  status: 'success',
  successfulExports: [],
  failedExports: [],
  output: { key: 'export.zip' },
};

// Emits one event per interview id, all in a single queue operation, so the
// runner reaches the end of the pipeline without ever yielding the scheduler
// to the fiber draining the queue.
vi.mock('@codaco/network-exporters/pipeline', () => ({
  exportPipeline: (
    interviewIds: string[],
    _options: ExportOptions,
    progressQueue: Queue.Enqueue<ExportEvent>,
  ) =>
    Effect.gen(function* () {
      const events: ExportEvent[] = interviewIds.map((_id, index) => ({
        type: 'progress',
        stage: 'generating',
        current: index + 1,
        total: interviewIds.length,
      }));
      yield* Queue.offerAll(progressQueue, events);
      return pipelineResult;
    }),
}));

const exportOptions: ExportOptions = {
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

function makeSession(id: string): InterviewExportInput {
  return {
    id,
    participantIdentifier: `case-${id}`,
    startTime: new Date(0),
    finishTime: null,
    network: {
      nodes: [],
      edges: [],
      ego: { _uid: `ego-${id}`, attributes: {} },
    },
    protocolHash: 'hash-1',
  };
}

describe('runPipelineWithData event delivery', () => {
  it('delivers every queued event to onEvent before resolving', async () => {
    const sessions = Array.from({ length: 50 }, (_unused, index) =>
      makeSession(`s${index + 1}`),
    );
    const received: ExportEvent[] = [];

    const run = await runPipelineWithData({
      data: { sessions, protocols: {} },
      options: exportOptions,
      onEvent: (event) => {
        received.push(event);
      },
    });

    expect(run.result).toEqual(pipelineResult);
    expect(received).toEqual(
      sessions.map((_session, index) => ({
        type: 'progress',
        stage: 'generating',
        current: index + 1,
        total: sessions.length,
      })),
    );
  });
});
