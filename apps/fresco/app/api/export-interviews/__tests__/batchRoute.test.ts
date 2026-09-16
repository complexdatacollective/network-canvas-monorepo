import { Effect, Layer, Queue } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExportEvent } from '@codaco/network-exporters/events';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type { ExportReturn } from '@codaco/network-exporters/output';
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

const interviewCount = vi.fn(() => Promise.resolve(1));
vi.mock('~/lib/db', () => ({
  prisma: { interview: { count: () => interviewCount() } },
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

const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => afterCallbacks.push(callback),
}));

const emptyExportReturn: ExportReturn = {
  status: 'success',
  successfulExports: [],
  failedExports: [],
  output: {},
};

let offerBeforeCompleting: ExportEvent[] = [];

vi.mock('@codaco/network-exporters/pipeline', () => ({
  exportPipeline: (
    _interviewIds: string[],
    _exportOptions: ExportOptions,
    queue: Queue.Enqueue<ExportEvent>,
  ) =>
    Effect.gen(function* () {
      for (const event of offerBeforeCompleting) {
        yield* Queue.offer(queue, event);
      }
      return emptyExportReturn;
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

function batchRequest() {
  return new Request('http://localhost/api/export-interviews/batch', {
    method: 'POST',
    body: JSON.stringify({ interviewIds: ['interview-1'], exportOptions }),
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
});

describe('POST /api/export-interviews/batch', () => {
  it('closes the response when the progress queue is empty at the drain point', async () => {
    const response = await POST(batchRequest());
    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const events = await readAllEvents(response.body!);

    expect(events).toEqual([{ type: 'complete', failedSessionIds: [] }]);
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
      { type: 'complete', failedSessionIds: [] },
    ]);
  }, 10_000);
});
