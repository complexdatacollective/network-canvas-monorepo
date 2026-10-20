import { Effect, Layer, Queue } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProcessingError } from '@codaco/network-exporters/errors';
import type { ExportEvent } from '@codaco/network-exporters/events';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type {
  ExportReturn,
  ExportWarning,
} from '@codaco/network-exporters/output';
import {
  type ExportStreamEvent,
  parseExportEventBuffer,
} from '~/lib/export/streamProtocol';

// The drain at the end of the route is the subject: it must flush whatever the
// progress fiber left in the queue and then close the SSE writer. Everything
// the route reaches on the way there (auth, database, telemetry, repositories)
// is replaced so the only real machinery under test is the Effect program.
vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: () => Promise.resolve(),
}));

// Each interview of the request, with its protocol's schema version.
let storedInterviews: { id: string; protocol: { schemaVersion: number } }[] =
  [];
vi.mock('~/lib/db', () => ({
  prisma: {
    interview: { findMany: () => Promise.resolve(storedInterviews) },
  },
}));

vi.mock('~/lib/posthog-server', () => ({
  captureException: () => Promise.resolve(),
  flushPostHog: () => Promise.resolve(),
}));

vi.mock('~/lib/export/InterviewRepository', () => ({
  PrismaInterviewRepository: Layer.empty,
}));
vi.mock('~/lib/export/ProtocolRepository', () => ({
  PrismaProtocolRepository: Layer.empty,
}));
vi.mock('~/lib/schema-8/export/InterviewRepository', () => ({
  LegacyPrismaInterviewRepository: Layer.empty,
}));
vi.mock('~/lib/schema-8/export/ProtocolRepository', () => ({
  LegacyPrismaProtocolRepository: Layer.empty,
}));

const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => afterCallbacks.push(callback),
}));

const emptyExportReturn: ExportReturn = {
  status: 'success',
  successfulExports: [],
  failedExports: [],
  warnings: [],
  output: {},
};

let exportReturn: ExportReturn = emptyExportReturn;
let offerBeforeCompleting: ExportEvent[] = [];

// The interviews each exporter was asked for.
let exportedByCurrent: string[][] = [];
let exportedByLegacy: string[][] = [];
let legacyFailedExports: ExportReturn['failedExports'] = [];

vi.mock('@codaco/network-exporters/pipeline', () => ({
  exportPipeline: (
    interviewIds: string[],
    _exportOptions: ExportOptions,
    queue: Queue.Enqueue<ExportEvent>,
  ) =>
    Effect.gen(function* () {
      exportedByCurrent.push(interviewIds);
      for (const event of offerBeforeCompleting) {
        yield* Queue.offer(queue, event);
      }
      return exportReturn;
    }),
}));

vi.mock('fresco-schema-8/network-exporters/pipeline', () => ({
  exportPipeline: (interviewIds: string[]) =>
    Effect.sync(() => {
      exportedByLegacy.push(interviewIds);
      return {
        status: 'success',
        successfulExports: [],
        failedExports: legacyFailedExports,
        output: {},
      };
    }),
}));

const { POST } = await import('~/app/api/export-interviews/batch/route');

const exportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

function batchRequest(interviewIds = ['interview-1']) {
  return new Request('http://localhost/api/export-interviews/batch', {
    method: 'POST',
    body: JSON.stringify({ interviewIds, exportOptions }),
  });
}

// Reads until the stream ends. If the route's drain never completes, the writer
// is never closed and this promise never settles — which is exactly the failure
// the test's timeout has to surface.
async function readAllEvents(
  body: ReadableStream<Uint8Array>,
): Promise<ExportStreamEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ExportStreamEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseExportEventBuffer(buffer);
    events.push(...parsed.events);
    buffer = parsed.rest;
  }
  return events;
}

beforeEach(() => {
  afterCallbacks.length = 0;
  offerBeforeCompleting = [];
  exportReturn = emptyExportReturn;
  storedInterviews = [{ id: 'interview-1', protocol: { schemaVersion: 9 } }];
  exportedByCurrent = [];
  exportedByLegacy = [];
  legacyFailedExports = [];
});

describe('POST /api/export-interviews/batch', () => {
  it('closes the response when the progress queue is empty at the drain point', async () => {
    const response = await POST(batchRequest());
    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const events = await readAllEvents(response.body!);

    expect(events).toEqual([
      { type: 'complete', failedSessionIds: [], warnings: [] },
    ]);
    expect(afterCallbacks).toHaveLength(1);
  }, 10_000);

  it('writes every progress event once, in order, before completing', async () => {
    offerBeforeCompleting = [
      { type: 'stage', stage: 'fetching', message: 'Fetching' },
      { type: 'stage', stage: 'formatting', message: 'Formatting' },
      { type: 'stage', stage: 'generating', message: 'Generating' },
    ];

    const response = await POST(batchRequest());
    const events = await readAllEvents(response.body!);

    expect(events).toEqual([
      ...offerBeforeCompleting,
      { type: 'complete', failedSessionIds: [], warnings: [] },
    ]);
  }, 10_000);

  it('carries the pipeline warnings in the complete event', async () => {
    const warning: ExportWarning = {
      kind: 'xml-illegal-characters',
      sessionId: 'interview-1',
      caseId: 'P-7',
      variables: ['Nickname'],
      caseIdChanged: false,
    };
    exportReturn = { ...emptyExportReturn, warnings: [warning] };

    const response = await POST(batchRequest());
    const events = await readAllEvents(response.body!);

    expect(events).toEqual([
      { type: 'complete', failedSessionIds: [], warnings: [warning] },
    ]);
  }, 10_000);

  it('exports schema 8 interviews with the schema 8 exporter, into the same stream', async () => {
    storedInterviews = [
      { id: 'current-1', protocol: { schemaVersion: 9 } },
      { id: 'legacy-1', protocol: { schemaVersion: 8 } },
      { id: 'legacy-2', protocol: { schemaVersion: 8 } },
    ];
    legacyFailedExports = [
      {
        kind: 'session-processing',
        sessionId: 'legacy-2',
        error: new SessionProcessingError({
          cause: new Error('unreadable'),
          stage: 'format',
          sessionId: 'legacy-2',
        }),
      },
    ];

    const response = await POST(
      batchRequest(['current-1', 'legacy-1', 'legacy-2']),
    );
    const events = await readAllEvents(response.body!);

    expect(exportedByCurrent).toEqual([['current-1']]);
    expect(exportedByLegacy).toEqual([['legacy-1', 'legacy-2']]);
    expect(events).toEqual([
      { type: 'complete', failedSessionIds: ['legacy-2'], warnings: [] },
    ]);
  }, 10_000);

  it('runs only the exporter a batch needs', async () => {
    storedInterviews = [{ id: 'legacy-1', protocol: { schemaVersion: 8 } }];

    const response = await POST(batchRequest(['legacy-1']));
    await readAllEvents(response.body!);

    expect(exportedByCurrent).toEqual([]);
    expect(exportedByLegacy).toEqual([['legacy-1']]);
  }, 10_000);

  it('refuses a batch naming an interview that does not exist', async () => {
    storedInterviews = [];

    const response = await POST(batchRequest(['missing']));

    expect(response.status).toBe(404);
  });
});
