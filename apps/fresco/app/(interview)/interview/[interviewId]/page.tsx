import { notFound, redirect } from 'next/navigation';
import { after, connection } from 'next/server';
import { Suspense } from 'react';
import { SuperJSON } from 'superjson';

import Spinner from '@codaco/fresco-ui/Spinner';
import { getRequestedLocales, getServerIntl } from '~/i18n/server';
import { getAdmittedSession } from '~/lib/auth/guards';
import { getLimitedInterviewId } from '~/lib/limitInterviewsCookie';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { interviewPath, isLegacySchemaVersion } from '~/lib/schema-8/version';
import { getAppSetting, getDisableAnalytics } from '~/queries/appSettings';
import {
  getInterviewById,
  type GetInterviewByIdQuery,
} from '~/queries/interviews';

import { ErrorMessage } from '../_components/ErrorMessage';
import { recordInterviewOpened } from '../_components/recordInterviewOpened';
import { unopenableInterviewMessages } from '../_components/unopenableInterviewMessages';
import InterviewClient from './InterviewClient';
import { mapInterviewForViewer } from './mapInterviewPayload';

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

  // A schema 8 protocol is kept as it was imported and runs in the bundled
  // schema 8 interview. Links handed out before an upgrade, and the
  // dashboard's, still name this route, so they are sent on.
  if (isLegacySchemaVersion(interview.protocol.schemaVersion)) {
    redirect(interviewPath(interview.id, interview.protocol.schemaVersion));
  }
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
        title={intl.formatMessage(unopenableInterviewMessages.unreadableTitle)}
        message={intl.formatMessage(
          mapped.unreadable === 'protocol'
            ? unopenableInterviewMessages.protocolUnreadable
            : unopenableInterviewMessages.sessionUnreadable,
        )}
      />
    );
  }

  // Recorded only once the interview can actually be opened: a refusal above
  // must not leave an activity entry claiming it was.
  after(() =>
    recordInterviewOpened(interviewId, session?.user.username ?? null),
  );

  const { payload, assetUrls, initialStep, initialSyncRevision, view } = mapped;

  const installationId = (await getAppSetting('installationId')) ?? 'unknown';
  // Use the same helper as the rest of the app, so a DISABLE_ANALYTICS
  // environment override also opts the interview runtime out of telemetry.
  const disableAnalytics = (await getDisableAnalytics()) ?? false;
  // Negotiated from the request rather than in the browser so the server
  // render and hydration choose the same protocol language.
  const requestedLocales = await getRequestedLocales();

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
    />
  );
}
