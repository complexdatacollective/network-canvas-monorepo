import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { ensureError } from '@codaco/shared-consts';
import { prisma } from '~/lib/db';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

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
      protocol: { select: { localization: true } },
    },
  });

  if (!interview) {
    return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  }

  // The stored locale reaches every export, and this endpoint is
  // unauthenticated, so only a language the protocol declares is accepted.
  const declared = interview.protocol.localization.locales;
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
    return NextResponse.json({ success: true, applied: false, frozen: true });
  }

  try {
    await prisma.interview.update({
      where: { id: interviewId },
      data: { locale, localePreference },
    });

    return NextResponse.json({ success: true, applied: true });
  } catch (e) {
    const error = ensureError(e);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

export { routeHandler as POST };
