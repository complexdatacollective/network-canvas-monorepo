import { createFileRoute } from '@tanstack/react-router';
import { Effect, Fiber, Layer, Queue, Ref } from 'effect';

import { type ExportEvent } from '@codaco/network-exporters/events';
import { exportPipeline } from '@codaco/network-exporters/pipeline';
import { prisma } from '~/lib/db';
import { makeFileStreamOutputLayer } from '~/lib/export/FileStreamOutput';
import { PrismaInterviewRepository } from '~/lib/export/InterviewRepository';
import { PrismaProtocolRepository } from '~/lib/export/ProtocolRepository';
import { encodeExportEvent } from '~/lib/export/streamProtocol';
import { captureException, shutdownPostHog } from '~/lib/posthog-server';
import { exportInterviewsSchema } from '~/schemas/export';
import { getServerSession } from '~/src/server/session';

/**
 * `app/api/export-interviews/batch/route.ts`, at the same URL and with the same
 * request body, response frames, status codes and headers.
 *
 * Two Next.js mechanisms are replaced:
 *
 * - `requireApiAuth()` — a server *route* cannot use the `authed` function
 *   middleware (that is `createServerFn` only), so the guard is
 *   `getServerSession()` plus the same 401 envelope the Next route returns.
 * - `after()` — spike S4 established that on a long-lived Node server a promise
 *   started in a handler settles normally after the response is sent, and a
 *   `TransformStream` response body is not truncated when the handler returns.
 *   The export run is therefore plain fire-and-forget. This does NOT hold on
 *   Netlify, where the invocation can be frozen once the response returns; that
 *   is a known open risk for the serverless target.
 */

async function post(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = exportInterviewsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const interviewIds = [...new Set(parsed.data.interviewIds)];
  const { exportOptions } = parsed.data;

  // Defense-in-depth: the client orchestrator batches at EXPORT_BATCH_SIZE
  // (200). Reject an oversized direct request so a single invocation can't
  // recreate the serverless time/memory failure this batching design avoids.
  const MAX_BATCH_INTERVIEWS = 500;
  if (interviewIds.length > MAX_BATCH_INTERVIEWS) {
    return Response.json(
      {
        error: `Too many interviews in one batch (max ${String(MAX_BATCH_INTERVIEWS)})`,
      },
      { status: 413 },
    );
  }

  const count = await prisma.interview.count({
    where: { id: { in: interviewIds } },
  });
  if (count !== interviewIds.length) {
    return Response.json(
      { error: 'One or more interviews not found' },
      { status: 404 },
    );
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const exportLayer = Layer.mergeAll(
    PrismaInterviewRepository,
    PrismaProtocolRepository,
    makeFileStreamOutputLayer(writer),
  );

  const program = Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExportEvent>();

    // Coalesce progress to one frame per integer percent (a large batch emits
    // one per file); always forward stage events.
    const lastPct = yield* Ref.make(-1);
    const progressFiber = yield* Effect.fork(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap((event) => {
            if (event.type === 'stage') {
              return Effect.promise(() =>
                writer.write(encodeExportEvent(event)),
              );
            }
            const pct =
              event.total > 0
                ? Math.round((event.current / event.total) * 100)
                : 0;
            return Ref.getAndSet(lastPct, pct).pipe(
              Effect.flatMap((prev) =>
                prev === pct
                  ? Effect.void
                  : Effect.promise(() =>
                      writer.write(encodeExportEvent(event)),
                    ),
              ),
            );
          }),
        ),
      ),
    );

    const result = yield* exportPipeline(interviewIds, exportOptions, queue);

    yield* Fiber.interrupt(progressFiber);
    const remaining = yield* Queue.takeAll(queue);
    yield* Effect.forEach(remaining, (event) =>
      Effect.promise(() => writer.write(encodeExportEvent(event))),
    );

    return result;
  }).pipe(
    Effect.tap((result) =>
      Effect.promise(async () => {
        const failedSessionIds = [
          ...new Set(result.failedExports.map((failure) => failure.sessionId)),
        ];
        await writer.write(
          encodeExportEvent({ type: 'complete', failedSessionIds }),
        );
        await writer.close();
      }),
    ),
    Effect.tapError((error) =>
      Effect.promise(async () => {
        const message =
          error instanceof Error ? error.message : 'Export failed';
        await writer
          .write(encodeExportEvent({ type: 'error', message }))
          .catch(() => undefined);
        await writer.close().catch(() => undefined);
        await captureException(error);
        await shutdownPostHog();
      }),
    ),
    Effect.catchAll(() => Effect.void),
    Effect.provide(exportLayer),
  );

  const fiber = Effect.runFork(program);

  request.signal.addEventListener('abort', () => {
    Effect.runFork(Fiber.interrupt(fiber));
    void writer.close().catch(() => undefined);
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}

export const Route = createFileRoute('/api/export-interviews/batch')({
  server: {
    handlers: {
      POST: ({ request }) => post(request),
    },
  },
});
