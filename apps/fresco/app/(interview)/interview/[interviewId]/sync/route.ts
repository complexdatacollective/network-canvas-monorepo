import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { NcNetworkSchema, StageMetadataSchema } from '@codaco/shared-consts';
import { prisma } from '~/lib/db';
import { captureException, shutdownPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';
import { ensureError } from '~/utils/ensureError';

/**
 * Handle post requests from the client to store the current interview state.
 */
const routeHandler = async (
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> },
) => {
  const { interviewId } = await params;

  const invalidRequest = (error: unknown) => {
    after(async () => {
      await captureException(error, { interviewId });
      await shutdownPostHog();
    });

    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  };

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    return invalidRequest(error);
  }

  const Schema = z.object({
    id: z.string(),
    network: NcNetworkSchema,
    currentStep: z.number(),
    stageMetadata: StageMetadataSchema.optional(),
    lastUpdated: z.string(),
  });

  const validatedRequest = Schema.safeParse(rawPayload);

  if (!validatedRequest.success) {
    // Return a generic message rather than the full Zod error, which would
    // otherwise disclose the accepted schema shape to unauthenticated callers.
    return invalidRequest(validatedRequest.error);
  }

  const { network, currentStep, stageMetadata } = validatedRequest.data;

  const freezeEnabled = await getAppSetting('freezeInterviewsAfterCompletion');

  if (freezeEnabled) {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { finishTime: true },
    });

    if (interview?.finishTime) {
      return NextResponse.json({ success: true });
    }
  }

  try {
    await prisma.interview.update({
      where: {
        id: interviewId,
      },
      data: {
        network,
        currentStep,
        stageMetadata: stageMetadata ?? undefined,
        // `lastUpdated` is intentionally NOT taken from the client. Prisma's
        // @updatedAt sets it server-side; trusting the client value let a
        // participant backdate it (overwriting newer data) and corrupt the
        // dashboard sort/filter/export ordering, which keys on this column.
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const error = ensureError(e);
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }
};

export { routeHandler as POST };
