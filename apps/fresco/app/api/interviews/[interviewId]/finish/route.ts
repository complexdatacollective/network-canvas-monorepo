import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  FinishOutcomeSchema,
  isFinishSessionStage,
} from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { addEvent } from '~/lib/activityFeed';
import { safeRevalidateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { parseStoredInterviewSession } from '~/lib/db/storedInterviewSession';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';
import { setLimitInterviewsCookie } from '~/lib/limitInterviewsCookie';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

/**
 * Where the interview ended: the finish stage the participant confirmed Finish
 * on, and the outcome that stage declares.
 *
 * An upgrade restarts the server but not the browsers already showing an
 * interview: a tab opened before it keeps running the previous bundle, which
 * finishes with a bodyless POST. That request is still accepted, as a finish at
 * the protocol's finish stage — a protocol has exactly one, so it is the stage
 * the previous bundle's participant reached. A body, once sent, must be whole.
 */
const FinishRequestSchema = z.object({
  stageId: z.string(),
  outcome: FinishOutcomeSchema,
});

/**
 * Report a malformed finish request and answer with a 400. As in the sync
 * route, the report carries no interview id: the id is the participant's
 * unauthenticated access capability.
 */
const invalidRequest = (error: unknown) => {
  after(async () => {
    await captureException(error, { context: 'interview.finish' });
    await flushPostHog();
  });

  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
};

/**
 * The finish the request names, or `null` for the previous bundle's bodyless
 * finish.
 */
async function readFinishRequest(
  request: NextRequest,
): Promise<
  | { success: true; data: z.infer<typeof FinishRequestSchema> | null }
  | { success: false; error: unknown }
> {
  try {
    const text = await request.text();
    if (text === '') return { success: true, data: null };
    return FinishRequestSchema.safeParse(JSON.parse(text));
  } catch (error) {
    return { success: false, error };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  const { interviewId } = await params;

  const read = await readFinishRequest(request);
  if (!read.success) {
    // A generic message rather than the Zod error, which would disclose the
    // accepted shape to unauthenticated callers.
    return invalidRequest(read.error);
  }
  const requested = read.data;

  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        finishTime: true,
        protocolId: true,
        protocol: {
          select: {
            stages: true,
            codebook: true,
            localization: true,
            interfaceText: true,
            experiments: true,
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 },
      );
    }

    // A protocol whose stored design does not parse cannot say which finish
    // stages it has, so the finish is refused rather than recorded unchecked.
    const storedProtocol = parseStoredProtocol(interview.protocol);
    if (!storedProtocol.success) {
      throw new Error(
        'The protocol of an interview being finished could not be read',
        { cause: storedProtocol.error },
      );
    }

    // The outcome reaches every export, and this endpoint is unauthenticated,
    // so a finish is accepted only as the protocol declares it: the stage must
    // be one of the protocol's finish stages, and the outcome the one that
    // stage declares.
    const finishStages =
      storedProtocol.data.stages.filter(isFinishSessionStage);
    const finishStage = requested
      ? finishStages.find((stage) => stage.id === requested.stageId)
      : finishStages.length === 1
        ? finishStages[0]
        : undefined;

    if (!finishStage) {
      return invalidRequest(
        new Error(
          requested
            ? 'Finish names a stage that is not a finish stage'
            : 'Bodyless finish against a protocol without exactly one finish stage',
        ),
      );
    }

    if (requested && finishStage.outcome !== requested.outcome) {
      return invalidRequest(
        new Error('Finish outcome differs from the one its stage declares'),
      );
    }

    const freezeEnabled = await getAppSetting(
      'freezeInterviewsAfterCompletion',
    );

    // A frozen interview keeps the finish it recorded, as it keeps every other
    // answer. The browser is still told the interview is finished, which it is.
    const frozen = async () => {
      await setLimitInterviewsCookie(interview.protocolId, interviewId);
      return NextResponse.json({ success: true, applied: false, frozen: true });
    };

    if (freezeEnabled && interview.finishTime) {
      return await frozen();
    }

    // The freeze has to be part of the write itself, as in the sync route:
    // checking the read above and then updating would let two overlapping
    // finishes both pass the check, the later overwriting the first's time and
    // both reporting a completion. Postgres re-evaluates the WHERE clause after
    // waiting on the row lock, so of the two only one matches.
    const { count } = await prisma.interview.updateMany({
      where: {
        id: interviewId,
        ...(freezeEnabled ? { finishTime: null } : {}),
      },
      data: {
        finishTime: new Date(),
        finishStageId: finishStage.id,
        finishOutcome: finishStage.outcome,
      },
    });

    // Nothing matched: the interview was finished, and so frozen, since it was
    // read — or it no longer exists. The re-read below tells them apart.
    const updatedInterview =
      count > 0 || freezeEnabled
        ? await prisma.interview.findUnique({
            where: { id: interviewId },
            include: { participant: true },
          })
        : null;

    if (!updatedInterview) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 },
      );
    }

    if (count === 0) {
      return await frozen();
    }

    const { label, identifier } = updatedInterview.participant;
    const participantDisplay = label ? `${label} (${identifier})` : identifier;

    // Only the sizes are recorded, so stored data that does not parse costs the
    // activity its counts and nothing else: finishing writes no network.
    const stored = parseStoredInterviewSession(updatedInterview);

    void addEvent(
      'Interview Completed',
      `Participant "${participantDisplay}" completed an interview`,
      {
        kind: 'interviewCompleted',
        values: { participant: participantDisplay },
      },
      stored.success
        ? {
            nodeCount: stored.data.network.nodes.length,
            edgeCount: stored.data.network.edges.length,
          }
        : undefined,
    );

    await setLimitInterviewsCookie(updatedInterview.protocolId, interviewId);

    safeRevalidateTag(['getInterviews', 'summaryStatistics', 'activityFeed']);

    return NextResponse.json({ success: true, applied: true });
  } catch (e) {
    const error = ensureError(e);

    after(async () => {
      await captureException(error, { context: 'interview.finish' });
      await flushPostHog();
    });

    return NextResponse.json(
      { error: 'Failed to finish interview' },
      { status: 500 },
    );
  }
}
