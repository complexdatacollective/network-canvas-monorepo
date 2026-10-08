import { notFound, redirect } from 'next/navigation';
import { after, connection } from 'next/server';
import { Suspense } from 'react';
import SuperJSON from 'superjson';

import { defineMessages } from '@codaco/app-i18n/messages';
import Spinner from '@codaco/fresco-ui/Spinner';
import { loadInterviewCatalog } from '@codaco/interview/catalog';
import { type ActivityType } from '~/app/dashboard/_components/ActivityFeed/types';
import type { ActivityLocalization } from '~/i18n/activityDetails';
import { getRequestedLocales, getServerIntl } from '~/i18n/server';
import { getAdmittedSession } from '~/lib/auth/guards';
import { safeRevalidateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { getLimitedInterviewId } from '~/lib/limitInterviewsCookie';
import {
  captureEvent,
  captureException,
  flushPostHog,
} from '~/lib/posthog-server';
import { getAppSetting, getDisableAnalytics } from '~/queries/appSettings';
import {
  getInterviewById,
  type GetInterviewByIdQuery,
} from '~/queries/interviews';

import { ErrorMessage } from '../_components/ErrorMessage';
import InterviewClient from './InterviewClient';
import { mapInterviewForViewer } from './mapInterviewPayload';

const messages = defineMessages({
  unreadableTitle: {
    id: 'fresco.interview.page.unreadableTitle',
    defaultMessage: 'This interview could not be opened',
    description:
      'Participant-facing heading shown instead of an interview whose stored protocol or answers could not be read.',
  },
  protocolUnreadable: {
    id: 'fresco.interview.page.protocolUnreadable',
    defaultMessage:
      'This interview could not be loaded, so it has not been started. Nothing has been changed. Please contact the person who recruited you to this study for assistance.',
    description:
      'Participant-facing explanation shown when the protocol an interview uses could not be read, so the interview was not started.',
  },
  sessionUnreadable: {
    id: 'fresco.interview.page.sessionUnreadable',
    defaultMessage:
      'The answers saved for this interview could not be read, so it has not been started. Nothing has been changed. Please contact the person who recruited you to this study for assistance.',
    description:
      'Participant-facing explanation shown when the answers saved for an interview could not be read, so the interview was not started.',
  },
});

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

  // A dynamic route segment is never empty, so this is unreachable in
  // practice; if it ever were, there is no interview to show.
  if (!interviewId) {
    notFound();
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

  // The completion cookie is a per-browser participant guard: a browser that
  // finished an interview of this protocol is sent back to that interview,
  // which shows its completed state, rather than into another one.
  // Authenticated users (e.g. an admin opening an interview from the
  // dashboard) must not be locked out of every interview for a protocol they
  // previously completed a test interview for in this browser.
  //
  // A finished interview is not redirected anywhere: it opens on its completed
  // state, for participants and researchers alike.
  if (!session && limitInterviews) {
    const limitedInterviewId = await getLimitedInterviewId(
      interview.protocol.id,
    );

    if (limitedInterviewId && limitedInterviewId !== interview.id) {
      redirect(`/interview/${limitedInterviewId}`);
    }
  }

  // A finished interview's answers reach the browser only for a researcher
  // who may still change them.
  const mapped = mapInterviewForViewer(interview, {
    researcher: session !== null,
    freezeCompletedInterviews: await getAppSetting(
      'freezeInterviewsAfterCompletion',
    ),
  });

  if (!mapped.success) {
    // Starting anyway would hand the client a network built without the stored
    // one, which its first sync would replace, or run it against an empty
    // design. The report carries no interview id: the id is the participant's
    // access link, and the report leaves the deployment.
    after(async () => {
      await captureException(mapped.error, {
        context:
          mapped.unreadable === 'protocol'
            ? 'interview.load.protocolUnreadable'
            : 'interview.load.unreadable',
      });
      await flushPostHog();
    });

    const intl = await getServerIntl();
    return (
      <ErrorMessage
        title={intl.formatMessage(messages.unreadableTitle)}
        message={intl.formatMessage(
          mapped.unreadable === 'protocol'
            ? messages.protocolUnreadable
            : messages.sessionUnreadable,
        )}
      />
    );
  }

  // Recorded only once the interview can actually be opened: a refusal above
  // must not leave an activity entry claiming it was.
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

  const { payload, assetUrls, initialStep, initialSyncRevision, view } = mapped;

  const installationId = (await getAppSetting('installationId')) ?? 'unknown';
  // Use the same helper as the rest of the app, so a DISABLE_ANALYTICS
  // environment override also opts the interview runtime out of telemetry.
  const disableAnalytics = (await getDisableAnalytics()) ?? false;
  // Negotiated from the request rather than in the browser so the server
  // render and hydration choose the same protocol language.
  const requestedLocales = await getRequestedLocales();
  // The interview's own messages, in the language its Shell will negotiate
  // from the same request and the participant's stated language, travel with
  // the page: otherwise hydration waits on a separate download before the
  // participant sees anything.
  const catalog = await loadInterviewCatalog(
    requestedLocales,
    payload.session.localePreference,
  );

  return (
    <InterviewClient
      payload={payload}
      assetUrls={assetUrls}
      initialStep={initialStep}
      initialSyncRevision={initialSyncRevision}
      requestedLocales={requestedLocales}
      installationId={installationId}
      disableAnalytics={disableAnalytics}
      view={view}
      catalog={catalog}
    />
  );
}
