import { createId } from '@paralleldrive/cuid2';

import {
  generateInterviews,
  type SyntheticInterviewResult,
} from '@codaco/protocol-utilities';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { prisma } from '~/lib/db';
import { collectSyntheticAssetData } from '~/lib/synthetic/assetData';
import { parseStoredProtocol } from '~/lib/synthetic/storedProtocol';
import { generateSyntheticInterviewsSchema } from '~/schemas/synthetic-interviews';

/**
 * A refusal the generator raised because the protocol's own declarations make
 * the data it asks for impossible — an unsatisfiable validation rule, or a
 * roster pool too small for the stage that draws from it.
 *
 * Recognised by name and shape rather than with `instanceof`: the class lives
 * in another package, and a duplicated module instance (two resolutions of
 * `@codaco/protocol-utilities`, or a bundler splitting server chunks) would
 * make the prototype check quietly false while the error is exactly the one we
 * mean to report.
 */
type ConstraintRefusal = {
  message: string;
  conflicts: unknown[];
};

function asConstraintRefusal(error: unknown): ConstraintRefusal | null {
  if (
    !(error instanceof Error) ||
    error.name !== 'SyntheticDataConstraintError'
  )
    return null;

  const { conflicts } = error as Error & { conflicts?: unknown };
  if (!Array.isArray(conflicts)) return null;

  return { message: error.message, conflicts };
}

export async function POST(request: Request) {
  let username: string;
  try {
    const session = await requireApiAuth();
    username = session.user.username;
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
    });
  }

  const parsed = generateSyntheticInterviewsSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
    });
  }

  const { protocolId, count, simulateDropOut, respectSkipLogicAndFiltering } =
    parsed.data;

  const protocolRecord = await prisma.protocol.findUnique({
    where: { id: protocolId },
    include: { assets: true },
  });

  if (!protocolRecord) {
    return new Response(JSON.stringify({ error: 'Protocol not found' }), {
      status: 404,
    });
  }

  // The generation boundary: the engine takes schema-parse output, and the
  // stored columns are not that until they are put back together and parsed.
  // Done before the stream opens so an inadmissible protocol answers as a plain
  // HTTP error rather than as a stream that only ever carries a failure.
  const protocolResult = await parseStoredProtocol(protocolRecord);

  if (!protocolResult.success) {
    return new Response(
      JSON.stringify({
        error: `Protocol "${protocolRecord.name}" could not be read for generation:\n${protocolResult.message}`,
      }),
      { status: 422 },
    );
  }

  const { protocol } = protocolResult;

  // A fresh seed per batch unless the caller pinned one, so two runs of the
  // same protocol are different interviews rather than the same ones twice. It
  // travels back with the completion event, which is what makes a batch
  // reproducible after the fact.
  const seed = parsed.data.seed ?? Math.floor(Math.random() * 2 ** 31);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const assetData = await collectSyntheticAssetData(
          protocol,
          protocolRecord.assets,
        );

        let results: SyntheticInterviewResult[];
        try {
          results = generateInterviews(
            protocol,
            {
              count,
              seed,
              simulateDropOut,
              respectSkipLogic: respectSkipLogicAndFiltering,
            },
            assetData,
            // Generation runs to completion synchronously, so these land as one
            // burst rather than as a ticking bar; they are still what says how
            // far the batch got if it fails partway, and the writes below are
            // the phase with something to watch.
            (done, total) => {
              send({
                type: 'progress',
                phase: 'generating',
                current: done,
                total,
              });
            },
          );
        } catch (error) {
          const refusal = asConstraintRefusal(error);
          if (!refusal) throw error;

          send({
            type: 'error',
            code: 'constraint-conflict',
            message: refusal.message,
            conflicts: refusal.conflicts,
          });
          return;
        }

        let created = 0;

        for (const result of results) {
          const { session } = result;
          const participantIdentifier = `test-${createId()}`;

          await prisma.interview.create({
            data: {
              // The engine's own session id is deliberately not reused as the
              // row id: it is drawn from the batch's seed, so re-running a
              // pinned seed would collide with the rows the first run wrote.
              network: session.network as object,
              // A drop-out is a genuine unfinished interview — no finish time,
              // and the step the participant stopped at, so it resumes there.
              currentStep: result.currentStep,
              startTime: new Date(session.startTime),
              finishTime: session.finishTime
                ? new Date(session.finishTime)
                : null,
              isSynthetic: true,
              stageMetadata: session.stageMetadata as object | undefined,
              participant: {
                create: {
                  identifier: participantIdentifier,
                  label: participantIdentifier,
                  isSynthetic: true,
                },
              },
              protocol: {
                connect: { id: protocolId },
              },
            },
            // `lastUpdated` is not written from `session.lastUpdated`: the
            // column is Prisma's `@updatedAt`, so the write time wins whatever
            // we pass. Accepted rather than worked around.
            select: { id: true },
          });

          created += 1;
          send({
            type: 'progress',
            phase: 'saving',
            current: created,
            total: results.length,
          });
        }

        void addEvent(
          'Synthetic Data Generated',
          `User ${username} generated ${String(created)} synthetic interviews for protocol "${protocolRecord.name}"`,
        );

        send({ type: 'complete', created, seed });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
