import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { prisma } from '~/lib/db';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

/**
 * How many times a write is attempted when the row's `lastUpdated` moves
 * between reading it and writing — a sync landing in that window. Syncs are
 * debounced to seconds apart, so a second attempt all but always lands.
 */
const MAX_WRITE_ATTEMPTS = 3;

const LocaleChangeSchema = z.object({
  locale: z.string(),
  localePreference: z.string().nullable(),
});

/**
 * Report a malformed locale change and answer with a 400. As in the sync
 * route, the report carries no interview id: the id is the participant's
 * unauthenticated access capability.
 */
const invalidRequest = (error: unknown) => {
  after(async () => {
    await captureException(error, { context: 'interview.locale' });
    await flushPostHog();
  });

  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
};

/**
 * Flagged, as the sync route flags it: freezing declines every write
 * permanently, so the client must not read it as a failure to retry.
 */
const frozenResponse = () =>
  NextResponse.json({ success: true, applied: false, frozen: true });

/**
 * Persist the interview's locale fields. Authorised exactly as the sync route
 * is: the interview id is the capability, and a finished interview is frozen
 * when the deployment says so.
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

  const validatedRequest = LocaleChangeSchema.safeParse(rawPayload);

  if (!validatedRequest.success) {
    return invalidRequest(validatedRequest.error);
  }

  const { locale, localePreference } = validatedRequest.data;

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      finishTime: true,
      lastUpdated: true,
      protocol: { select: { localization: true } },
    },
  });

  if (!interview) {
    return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  }

  // The stored locale reaches every export, and this endpoint is
  // unauthenticated, so only a language the protocol declares is accepted.
  // Read as stored, with no fallback: a protocol whose languages do not parse
  // declares none this endpoint could accept.
  const localization = CurrentProtocolSchema.shape.localization.safeParse(
    interview.protocol.localization,
  );
  if (!localization.success) {
    after(async () => {
      await captureException(localization.error, {
        context: 'interview.locale',
      });
      await flushPostHog();
    });
    return NextResponse.json(
      { error: "The interview's protocol could not be read" },
      { status: 500 },
    );
  }
  const declared = localization.data.locales;
  if (
    !declared.includes(locale) ||
    (localePreference !== null && !declared.includes(localePreference))
  ) {
    return invalidRequest(
      new Error('Locale change names a language the protocol does not declare'),
    );
  }

  const freezeEnabled = await getAppSetting('freezeInterviewsAfterCompletion');

  if (freezeEnabled && interview.finishTime) {
    return frozenResponse();
  }

  try {
    // Which language the interview is shown in is not an edit to it, so the
    // write keeps the row's `lastUpdated` — which the dashboard sorts, filters
    // and exports by — rather than letting `@updatedAt` advance it. Opening an
    // old interview, or choosing a language, would otherwise make it look
    // recently worked on.
    //
    // Both guards are part of the write itself, as in the sync route, since
    // Postgres re-evaluates the WHERE clause after waiting on the row lock.
    // Matching the `lastUpdated` that was read means a sync committed in
    // between is not wound back to the older time; matching an unfinished row
    // means an interview finished since the read is left frozen.
    let lastUpdated = interview.lastUpdated;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const { count } = await prisma.interview.updateMany({
        where: {
          id: interviewId,
          lastUpdated,
          ...(freezeEnabled ? { finishTime: null } : {}),
        },
        data: { locale, localePreference, lastUpdated },
      });

      if (count > 0) {
        return NextResponse.json({ success: true, applied: true });
      }

      // Nothing matched: the interview has been deleted, finished and so
      // frozen, or written since it was read. Only the last is worth another
      // attempt, against the time that write left.
      const current = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { finishTime: true, lastUpdated: true },
      });

      if (!current) {
        return NextResponse.json(
          { error: 'Interview not found' },
          { status: 404 },
        );
      }

      if (freezeEnabled && current.finishTime) {
        return frozenResponse();
      }

      lastUpdated = current.lastUpdated;
    }

    return NextResponse.json(
      { error: 'The interview changed while its locale was being written' },
      { status: 409 },
    );
  } catch (e) {
    const error = ensureError(e);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

export { routeHandler as POST };
