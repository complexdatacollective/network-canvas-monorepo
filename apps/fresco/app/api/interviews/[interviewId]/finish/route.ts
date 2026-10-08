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
 * on, and the outcome that stage declares. Required — an upgrade takes the
 * deployment down, so no browser is left running a bundle that finishes
 * without saying where.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  const { interviewId } = await params;

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    return invalidRequest(error);
  }

  const validatedRequest = FinishRequestSchema.safeParse(rawPayload);

  if (!validatedRequest.success) {
    // A generic message rather than the Zod error, which would disclose the
    // accepted shape to unauthenticated callers.
    return invalidRequest(validatedRequest.error);
  }

  const { stageId, outcome } = validatedRequest.data;

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
    const finishStage = storedProtocol.data.stages
      .filter(isFinishSessionStage)
      .find((stage) => stage.id === stageId);

    if (!finishStage) {
      return invalidRequest(
        new Error('Finish names a stage that is not a finish stage'),
      );
    }

    if (finishStage.outcome !== outcome) {
      return invalidRequest(
        new Error('Finish outcome differs from the one its stage declares'),
      );
    }

    const freezeEnabled = await getAppSetting(
      'freezeInterviewsAfterCompletion',
    );

    // A frozen interview keeps the finish it recorded, as it keeps every other
    // answer. The browser is still told the interview is finished, which it is.
    if (freezeEnabled && interview.finishTime) {
      await setLimitInterviewsCookie(interview.protocolId, interviewId);
      return NextResponse.json({ success: true, applied: false, frozen: true });
    }

    const updatedInterview = await prisma.interview.update({
      where: { id: interviewId },
      data: {
        finishTime: new Date(),
        finishStageId: finishStage.id,
        finishOutcome: finishStage.outcome,
      },
      include: { participant: true },
    });

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
