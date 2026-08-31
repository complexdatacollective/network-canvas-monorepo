import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  NcNetworkSchema,
  ensureError,
  StageMetadataSchema,
} from '@codaco/shared-consts';
import { prisma } from '~/lib/db';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

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
      await flushPostHog();
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
    /**
     * Position of this write in the browser's own sequence of syncs — see
     * `createInterviewSyncHandler`. Two syncs for one interview can be in
     * flight at once (an `unloading` write is issued rather than queued,
     * because a request waiting behind one that dies with the document would
     * never run at all), and the server may finish them in either order. This
     * is what lets the older one be discarded rather than committed last.
     *
     * Required, so there is no shape of request that reaches the row without an
     * order to be judged in. An upgrade takes the deployment down, so there is
     * no window in which a browser is running an older bundle against this.
     *
     * `lastUpdated` above is deliberately not used for this. It is a wall-clock
     * millisecond stamped by the interview reducer for a different purpose, so
     * it is coarse (two changes in one millisecond tie, and the later write
     * would be dropped), it can move backwards if the participant's device
     * clock is corrected — silently discarding every write afterwards — and it
     * is only as reliable as every future reducer case remembering to bump it.
     * This counter is owned by the code that issues the writes it orders.
     */
    syncRevision: z.number().int().nonnegative(),
  });

  const validatedRequest = Schema.safeParse(rawPayload);

  if (!validatedRequest.success) {
    // Return a generic message rather than the full Zod error, which would
    // otherwise disclose the accepted schema shape to unauthenticated callers.
    return invalidRequest(validatedRequest.error);
  }

  const { network, currentStep, stageMetadata, syncRevision } =
    validatedRequest.data;

  const freezeEnabled = await getAppSetting('freezeInterviewsAfterCompletion');

  if (freezeEnabled) {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { finishTime: true, syncRevision: true },
    });

    if (interview?.finishTime) {
      return NextResponse.json({
        success: true,
        applied: false,
        syncRevision: interview.syncRevision,
      });
    }
  }

  try {
    // The predicate is what makes a stale write a no-op, and it has to be part
    // of the write itself: reading the stored revision first and then updating
    // would leave a window in which the newer request commits in between.
    // Postgres re-evaluates the WHERE clause after waiting on the row lock, so
    // of two concurrent writes the lower-numbered one matches nothing.
    const { count } = await prisma.interview.updateMany({
      where: { id: interviewId, syncRevision: { lt: syncRevision } },
      data: {
        network,
        currentStep,
        stageMetadata: stageMetadata ?? undefined,
        syncRevision,
        // `lastUpdated` is intentionally NOT taken from the client. Prisma's
        // @updatedAt sets it server-side; trusting the client value let a
        // participant backdate it (overwriting newer data) and corrupt the
        // dashboard sort/filter/export ordering, which keys on this column.
      },
    });

    if (count > 0) {
      return NextResponse.json({ success: true, applied: true, syncRevision });
    }

    // Nothing matched, which means either the row holds a revision at least as
    // high as this one — a write that lost its race, and the interview already
    // holds newer state — or there is no such interview at all. Only the second
    // is a failure, so tell them apart rather than reporting success for a
    // write that had nowhere to land.
    const current = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { syncRevision: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 },
      );
    }

    // Reporting the stored revision lets the client resume from it. Without
    // that, a second tab — which seeded its counter when it loaded, and is
    // therefore behind the tab that has been writing since — would have every
    // write it ever makes discarded, rather than the one that overtook another.
    return NextResponse.json({
      success: true,
      applied: false,
      syncRevision: current.syncRevision,
    });
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
