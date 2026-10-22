import { loadInterviewCatalog } from 'fresco-schema-8/interview/catalog';
import { notFound, redirect } from 'next/navigation';
import { after, connection } from 'next/server';
import { Suspense } from 'react';
import SuperJSON from 'superjson';

import Spinner from '@codaco/fresco-ui/Spinner';
import { ErrorMessage } from '~/app/(interview)/interview/_components/ErrorMessage';
import { recordInterviewOpened } from '~/app/(interview)/interview/_components/recordInterviewOpened';
import { unopenableInterviewMessages } from '~/app/(interview)/interview/_components/unopenableInterviewMessages';
import { getFrescoI18nInitialization, getServerIntl } from '~/i18n/server';
import { getAdmittedSession } from '~/lib/auth/guards';
import { getLimitedInterviewId } from '~/lib/limitInterviewsCookie';
import { captureException, flushPostHog } from '~/lib/posthog-server';
import { interviewPath, isLegacySchemaVersion } from '~/lib/schema-8/version';
import { getAppSetting, getDisableAnalytics } from '~/queries/appSettings';
import {
  getInterviewById,
  type GetInterviewByIdQuery,
} from '~/queries/interviews';

import InterviewClient from './InterviewClient';
import { mapLegacyInterviewPayload } from './mapInterviewPayload';

/**
 * The schema 8 interview. Fresco keeps a protocol imported at schema 8 as it
 * was and runs its interviews here, in the interview released for schema 8,
 * rather than upgrading them. Everything around the interview (recruiting,
 * the dashboard, importing) stays in the current Fresco; this route shows only
 * the interview and, at its end, the thank-you page.
 */
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

  const rawInterview = await getInterviewById(interviewId);

  if (!rawInterview) {
    notFound();
  }

  const interview =
    SuperJSON.parse<NonNullable<GetInterviewByIdQuery>>(rawInterview);

  // Only schema 8 interviews run here; any other is sent to where it runs.
  if (!isLegacySchemaVersion(interview.protocol.schemaVersion)) {
    redirect(interviewPath(interview.id, interview.protocol.schemaVersion));
  }

  // A session still held at the mandatory two-factor gate is not a
  // researcher yet, and gets the participant treatment below.
  const session = await getAdmittedSession();

  // The schema 8 interview has no completed view of its own, so a participant
  // whose interview is finished, or whose browser already finished one of this
  // protocol's interviews while interviews are limited, sees the thank-you
  // page, as in Fresco 4. Researchers opening it from the dashboard are not
  // locked out.
  if (!session) {
    if (interview.finishTime) {
      redirect('/v8/interview/finished');
    }

    if (
      (await getAppSetting('limitInterviews')) &&
      (await getLimitedInterviewId(interview.protocol.id)) !== null
    ) {
      redirect('/v8/interview/finished');
    }
  }

  const mapped = mapLegacyInterviewPayload(interview);

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

  after(() =>
    recordInterviewOpened(interviewId, session?.user.username ?? null),
  );

  const { payload, assetUrls, initialStep, initialSyncRevision } = mapped;

  const installationId = (await getAppSetting('installationId')) ?? 'unknown';
  // Use the same helper as the rest of the app, so a DISABLE_ANALYTICS
  // environment override also opts the interview runtime out of telemetry.
  const disableAnalytics = (await getDisableAnalytics()) ?? false;
  // The interview's own messages, in the language its Shell will negotiate
  // from Fresco's, travel with the page: otherwise hydration waits on a
  // separate download before the participant sees anything.
  const { locale } = await getFrescoI18nInitialization();
  const catalog = await loadInterviewCatalog(locale);

  return (
    <InterviewClient
      payload={payload}
      assetUrls={assetUrls}
      initialStep={initialStep}
      initialSyncRevision={initialSyncRevision}
      installationId={installationId}
      disableAnalytics={disableAnalytics}
      catalog={catalog}
    />
  );
}
