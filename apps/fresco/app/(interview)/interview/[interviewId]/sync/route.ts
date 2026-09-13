import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  MAX_TIMING_HISTORY_LENGTH,
  type StageTimingPayload,
} from '@codaco/interview/contract';
import {
  NcNetworkSchema,
  ensureError,
  StageMetadataSchema,
} from '@codaco/shared-consts';
import { prisma } from '~/lib/db';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

/**
 * How far one accepted write may move the revision on. The client sends the
 * stored value plus one; the slack covers numbers burnt by writes that never
 * landed, which a participant on a failing connection accumulates.
 *
 * A bound is needed because this endpoint is unauthenticated. Without one, a
 * single crafted request could set the row to the maximum a PostgreSQL
 * `INTEGER` holds; every genuine browser would then seed its counter there,
 * send one higher, overflow the column and fail — an interview nobody could
 * ever sync again without repairing the database by hand. With it, a write
 * outside the window is discarded like any other and reported with the stored
 * revision, and the client's next attempt is numbered from that, so a counter
 * that has drifted comes back inside on its own.
 */
const MAX_REVISION_ADVANCE = 10_000;

const StageTimingExitSchema = z.object({
  stageIndex: z.number().int().nonnegative(),
  stageType: z.string().min(1).max(64),
  promptIndex: z.number().int().nonnegative(),
  promptCount: z.number().int().nonnegative(),
  durationMs: z.number().finite().nonnegative(),
  exitDirection: z.enum(['forward', 'back', 'jumped', 'abandoned']),
});

const StageTimingSchema = z
  .object({
    stageExits: z.array(StageTimingExitSchema).max(MAX_TIMING_HISTORY_LENGTH),
    promptExits: z
      .array(StageTimingExitSchema)
      .max(MAX_TIMING_HISTORY_LENGTH)
      .optional(),
    totalDurationMs: z.number().finite().nonnegative().optional(),
  })
  .optional();

/**
 * Report a malformed sync request and answer with a 400. The error report
 * deliberately carries no interview id: the id is the participant's
 * unauthenticated access capability, and the optional analytics leave the
 * deployment's infrastructure.
 */
const invalidRequest = (error: unknown) => {
  after(async () => {
    await captureException(error, { context: 'interview.sync' });
    await flushPostHog();
  });

  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
};

function validateTimingAgainstPinnedProtocol(
  timing: StageTimingPayload,
  stages: readonly { type: string }[],
): StageTimingPayload {
  const matchesStage = (
    exit: StageTimingPayload['stageExits'][number],
    allowFinish: boolean,
  ) => {
    const stage = stages[exit.stageIndex];
    return stage
      ? stage.type === exit.stageType
      : allowFinish &&
          exit.stageIndex === stages.length &&
          exit.stageType === 'FinishSession';
  };
  if (
    timing.stageExits.some((exit) => !matchesStage(exit, false)) ||
    timing.promptExits?.some((exit) => !matchesStage(exit, true))
  ) {
    throw new Error('Timing exit does not match the pinned protocol');
  }
  const retainedTotal = timing.stageExits.reduce(
    (sum, exit) => sum + exit.durationMs,
    0,
  );
  if (
    timing.totalDurationMs !== undefined &&
    Math.abs(timing.totalDurationMs - retainedTotal) > Number.EPSILON * 16
  ) {
    throw new Error('Timing total does not match retained stage exits');
  }
  return timing;
}

/**
 * Handle post requests from the client to store the current interview state.
 */
const routeHandler = async (
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> },
) => {
  const { interviewId } = await params;

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
    stageTiming: StageTimingSchema,
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

  const { network, currentStep, stageMetadata, stageTiming, syncRevision } =
    validatedRequest.data;

  const freezeEnabled = await getAppSetting('freezeInterviewsAfterCompletion');
  let persistedStageTiming = stageTiming;

  const interviewPolicy =
    freezeEnabled || stageTiming !== undefined
      ? await prisma.interview.findUnique({
          where: { id: interviewId },
          select: {
            finishTime: true,
            syncRevision: true,
            protocol: { select: { stages: true } },
          },
        })
      : null;

  if (freezeEnabled && interviewPolicy?.finishTime) {
    // Flagged, not just reported as unapplied: freezing declines every write
    // permanently, so a client must not retry it as a stale write.
    return NextResponse.json({
      success: true,
      applied: false,
      frozen: true,
      syncRevision: interviewPolicy.syncRevision,
    });
  }

  if (stageTiming !== undefined) {
    if (!interviewPolicy) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 },
      );
    }
    try {
      persistedStageTiming = validateTimingAgainstPinnedProtocol(
        stageTiming,
        interviewPolicy.protocol.stages,
      );
    } catch (error) {
      return invalidRequest(error);
    }
  }

  try {
    // The predicate is what makes a stale write a no-op, and it has to be part
    // of the write itself: reading the stored revision first and then updating
    // would leave a window in which the newer request commits in between.
    // Postgres re-evaluates the WHERE clause after waiting on the row lock, so
    // of two concurrent writes the lower-numbered one matches nothing.
    const { count } = await prisma.interview.updateMany({
      where: {
        id: interviewId,
        syncRevision: {
          lt: syncRevision,
          gte: syncRevision - MAX_REVISION_ADVANCE,
        },
      },
      data: {
        network,
        currentStep,
        stageMetadata: stageMetadata ?? undefined,
        ...(persistedStageTiming === undefined
          ? {}
          : { stageTiming: persistedStageTiming }),
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

    // Nothing matched. Either the row holds a revision this write does not beat
    // — one that lost its race, so the interview already holds newer state — or
    // the jump was too large to be plausible, or there is no such interview at
    // all. Only the last is a failure, so tell it apart rather than reporting
    // success for a write that had nowhere to land.
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

    // Reporting the stored revision lets the client number its retry from it.
    // Without that, a second tab — which seeded its counter when it loaded, and
    // is therefore behind the tab that has been writing since — would have every
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
