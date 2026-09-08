import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { after, connection } from 'next/server';
import { Suspense } from 'react';
import SuperJSON from 'superjson';

import Spinner from '@codaco/fresco-ui/Spinner';
import { type ActivityType } from '~/app/dashboard/_components/ActivityFeed/types';
import type { ActivityLocalization } from '~/i18n/activityDetails';
import { getAdmittedSession } from '~/lib/auth/guards';
import { safeRevalidateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { captureEvent, flushPostHog } from '~/lib/posthog-server';
import { getAppSetting, getDisableAnalytics } from '~/queries/appSettings';
import {
  getInterviewById,
  type GetInterviewByIdQuery,
} from '~/queries/interviews';

import InterviewClient from './InterviewClient';
import { mapInterviewPayload } from './mapInterviewPayload';

export default function Page(props: {
  params: Promise<{ interviewId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <InterviewContent params={props.params} />
    </Suspense>
  );
}

async function InterviewContent({
  params: paramsPromise,
}: {
  params: Promise<{ interviewId: string }>;
}) {
  await connection();
  const { interviewId } = await paramsPromise;

  if (!interviewId) {
    return 'No interview id found';
  }

  const rawInterview = await getInterviewById(interviewId);

  if (!rawInterview) {
    notFound();
  }

  const interview =
    SuperJSON.parse<NonNullable<GetInterviewByIdQuery>>(rawInterview);
  // A session still held at the mandatory two-factor gate is not a
  // researcher yet, and gets the participant treatment below.
  const session = await getAdmittedSession();

  const limitInterviews = await getAppSetting('limitInterviews');

  // The completion cookie is a per-browser participant guard. Authenticated
  // users (e.g. an admin opening an interview from the dashboard) must not be
  // locked out of every interview for a protocol they previously completed a
  // test interview for in this browser.
  if (
    !session &&
    limitInterviews &&
    (await cookies()).get(interview.protocol.id)
  ) {
    redirect('/interview/finished');
  }

  if (!session && interview?.finishTime) {
    redirect('/interview/finished');
  }

  after(async () => {
    try {
      const message = session
        ? `Interview "${interviewId}" was opened by user "${session.user.username}"`
        : `Interview "${interviewId}" was opened`;

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const recentEvent = await prisma.events.findFirst({
        where: {
          type: 'Interview Opened',
          message,
          timestamp: { gte: thirtyMinutesAgo },
        },
      });

      if (recentEvent) return;

      await prisma.events.create({
        data: {
          type: 'Interview Opened' satisfies ActivityType,
          message,
          localization: {
            kind: 'interviewOpened',
            values: {
              actor: session ? 'researcher' : 'participant',
              interview: interviewId,
              username: session?.user.username ?? '',
            },
          } satisfies ActivityLocalization,
        },
      });

      safeRevalidateTag('activityFeed');

      // The analytics copy of this event carries only who opened it. The feed
      // message above names the interview, and an interview id is the
      // participant's access link, so it must not leave the deployment.
      await captureEvent('Interview Opened', {
        actor: session ? 'researcher' : 'participant',
      });
      await flushPostHog();
    } catch {
      // Non-critical — don't block the interview
    }
  });

  const { payload, assetUrls, initialStep, initialSyncRevision } =
    mapInterviewPayload(interview);

  const installationId = (await getAppSetting('installationId')) ?? 'unknown';
  // Use the same helper as the rest of the app, so a DISABLE_ANALYTICS
  // environment override also opts the interview runtime out of telemetry.
  const disableAnalytics = (await getDisableAnalytics()) ?? false;

  return (
    <InterviewClient
      payload={payload}
      assetUrls={assetUrls}
      initialStep={initialStep}
      initialSyncRevision={initialSyncRevision}
      installationId={installationId}
      disableAnalytics={disableAnalytics}
    />
  );
}
