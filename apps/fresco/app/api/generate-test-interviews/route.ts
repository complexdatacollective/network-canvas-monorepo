import { createId } from '@paralleldrive/cuid2';
import { generateNetwork as generateLegacyNetwork } from 'fresco-schema-8/protocol-utilities';
import { after } from 'next/server';
import { type z } from 'zod';

import { createMessageError } from '@codaco/app-i18n/messages';
import {
  generateNetwork,
  type GenerateNetworkParams,
} from '@codaco/protocol-utilities';
import {
  type FinishOutcomeSchema,
  isFinishSessionStage,
} from '@codaco/protocol-validation';
import { syntheticGenerationMessages } from '~/i18n/syntheticGenerationMessages';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import { prisma } from '~/lib/db';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { parseLegacyStoredProtocol } from '~/lib/schema-8/storedProtocol';
import { isLegacySchemaVersion } from '~/lib/schema-8/version';
import { getSyntheticGenerationFailure } from '~/lib/syntheticGenerationFailure';
import { generateSyntheticInterviewsSchema } from '~/schemas/synthetic-interviews';

// A generator reports "no metadata" as null, but Prisma takes a Json column's
// null as Prisma.JsonNull or Prisma.DbNull, not a bare null. Omitting the
// field stores a database null.
const toStoredMetadata = (
  stageMetadata: Record<string, unknown> | null,
): object | undefined => stageMetadata ?? undefined;

export async function POST(request: Request) {
  let username: string;
  try {
    const session = await requireApiAuth();
    username = session.user.username;
  } catch {
    return Response.json(
      {
        error: createMessageError(syntheticGenerationMessages.signInRequired),
        diagnostic: 'Unauthorized',
      },
      {
        status: 401,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: createMessageError(syntheticGenerationMessages.invalidRequest),
        diagnostic: 'Invalid JSON body',
      },
      {
        status: 400,
      },
    );
  }

  const parsed = generateSyntheticInterviewsSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: createMessageError(syntheticGenerationMessages.invalidRequest),
        diagnostic: 'Invalid request body',
      },
      {
        status: 400,
      },
    );
  }

  const { protocolId, count, simulateDropOut, respectSkipLogicAndFiltering } =
    parsed.data;

  const protocol = await prisma.protocol.findUnique({
    where: { id: protocolId },
  });

  if (!protocol) {
    return Response.json(
      {
        error: createMessageError(syntheticGenerationMessages.missingProtocol),
        diagnostic: 'Protocol not found',
      },
      {
        status: 404,
      },
    );
  }

  // Generating from an empty stand-in would fill the deployment with
  // interviews that hold nothing, so refuse before creating any.
  const unreadable = (error: unknown) => {
    after(async () => {
      await captureException(error, {
        context: 'synthetic.protocol.unreadable',
      });
      await flushPostHog();
    });

    return Response.json(
      {
        error: createMessageError(
          syntheticGenerationMessages.unreadableProtocol,
        ),
        diagnostic: 'Protocol could not be read',
      },
      {
        status: 500,
      },
    );
  };

  // A schema 8 protocol is generated for by the generator released with
  // schema 8, so its interviews hold what the schema 8 interview would write.
  // It has no finish stages, so a completed one records no finish stage.
  let generate: (dropOut: boolean) => {
    network: object;
    stageMetadata: Record<string, unknown> | null;
    currentStep: number;
    droppedOut: boolean;
  };
  let finishAt: (currentStep: number) => {
    finishStageId: string | null;
    finishOutcome: z.infer<typeof FinishOutcomeSchema> | null;
  };

  if (isLegacySchemaVersion(protocol.schemaVersion)) {
    const storedProtocol = parseLegacyStoredProtocol(protocol);
    if (!storedProtocol.success) return unreadable(storedProtocol.error);
    const { codebook, stages } = storedProtocol.data;

    generate = (dropOut) =>
      generateLegacyNetwork({
        codebook,
        stages,
        simulateDropOut: dropOut,
        respectSkipLogicAndFiltering,
      });
    finishAt = () => ({ finishStageId: null, finishOutcome: null });
  } else {
    const storedProtocol = parseStoredProtocol(protocol);
    if (!storedProtocol.success) return unreadable(storedProtocol.error);
    const { codebook, stages } = storedProtocol.data;

    generate = (dropOut) =>
      generateNetwork({
        codebook,
        stages,
        simulateDropOut: dropOut,
        respectSkipLogicAndFiltering,
      } satisfies GenerateNetworkParams);
    // A completed synthetic interview ends at the finish stage its route
    // reached, and is recorded with that stage's outcome as a participant's
    // finish is.
    finishAt = (currentStep) => {
      const finishStage = stages[currentStep];
      return isFinishSessionStage(finishStage)
        ? { finishStageId: finishStage.id, finishOutcome: finishStage.outcome }
        : { finishStageId: null, finishOutcome: null };
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let completedCount = 0;
        const incompleteInterviewIds: string[] = [];

        for (let i = 0; i < count; i++) {
          const { network, stageMetadata, currentStep, droppedOut } =
            generate(simulateDropOut);

          const isCompleted = !droppedOut;
          if (isCompleted) {
            completedCount++;
          }

          const participantIdentifier = `test-${createId()}`;
          const startTime = new Date(
            Date.now() - Math.floor(Math.random() * 3600000),
          );
          const finishTime = isCompleted
            ? new Date(
                startTime.getTime() +
                  Math.floor(Math.random() * 1800000) +
                  300000,
              )
            : null;

          const created = await prisma.interview.create({
            data: {
              network: network as object,
              currentStep,
              startTime,
              finishTime,
              ...(isCompleted ? finishAt(currentStep) : {}),
              isSynthetic: true,
              stageMetadata: toStoredMetadata(stageMetadata),
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
          });

          if (!isCompleted) {
            incompleteInterviewIds.push(created.id);
          }

          send({ type: 'progress', current: i + 1, total: count });
        }

        // Enforce 10% minimum completion when drop-out is enabled.
        // Regenerate incomplete interviews from this batch with drop-out
        // disabled and update them in-place.
        if (simulateDropOut) {
          const minCompleted = Math.max(1, Math.ceil(count * 0.1));

          if (completedCount < minCompleted) {
            const deficit = minCompleted - completedCount;
            const toFix = incompleteInterviewIds.slice(0, deficit);

            const incompleteInterviews = await prisma.interview.findMany({
              where: { id: { in: toFix } },
              select: { id: true, startTime: true },
            });

            for (const interview of incompleteInterviews) {
              const { network, stageMetadata, currentStep } = generate(false);

              await prisma.interview.update({
                where: { id: interview.id },
                data: {
                  network: network as object,
                  currentStep,
                  stageMetadata: toStoredMetadata(stageMetadata),
                  finishTime: new Date(
                    interview.startTime.getTime() +
                      Math.floor(Math.random() * 1800000) +
                      300000,
                  ),
                  ...finishAt(currentStep),
                },
              });
            }
          }
        }

        void addEvent(
          'Synthetic Data Generated',
          `User ${username} generated ${String(count)} synthetic interviews for protocol "${protocol.name}"`,
          {
            kind: 'syntheticGenerated',
            values: { username, count, protocol: protocol.name },
          },
        );

        send({ type: 'complete', created: count });
      } catch (error) {
        const failure = getSyntheticGenerationFailure(error);
        send({ type: 'error', message: failure.diagnostic, ...failure });
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
