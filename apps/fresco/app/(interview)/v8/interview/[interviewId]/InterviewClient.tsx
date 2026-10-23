'use client';

import {
  Shell,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewAnalyticsMetadata,
  type InterviewPayload,
  type StepChangeHandler,
} from 'fresco-schema-8/interview';
import type { InterviewCatalog } from 'fresco-schema-8/interview/catalog';
import { useRouter } from 'next/navigation';
import { parseAsInteger, useQueryState } from 'nuqs';
import { posthog } from 'posthog-js';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { env } from '~/env.js';
import { POSTHOG_APP_NAME, POSTHOG_APP_VERSION } from '~/fresco.config';
import { useFrescoLocale } from '~/i18n/FrescoI18nProvider';
import { frescoCatalogSource } from '~/src/locales/catalogs';

import InterviewCompleted, {
  completionLocale,
} from '../_components/InterviewCompleted';
import { createInterviewSyncHandler } from './createInterviewSyncHandler';

type Props = {
  payload: InterviewPayload;
  assetUrls: Record<string, string>;
  initialStep: number;
  initialSyncRevision: number;
  installationId: string;
  disableAnalytics: boolean;
  catalog: InterviewCatalog;
};

/**
 * The schema 8 interview, hosted exactly as Fresco 4 hosted it. Nothing here
 * leads anywhere but the interview and its thank-you page.
 */
export default function InterviewClient({
  payload,
  assetUrls,
  initialStep,
  initialSyncRevision,
  installationId,
  disableAnalytics,
  catalog,
}: Props) {
  const router = useRouter();
  const { locale } = useFrescoLocale();
  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(initialStep).withOptions({ history: 'push' }),
  );

  // The package captures its handlers once, at store creation, so the asset
  // handler reads the latest URLs through a ref.
  const assetUrlsRef = useRef(assetUrls);
  useEffect(() => {
    assetUrlsRef.current = assetUrls;
  }, [assetUrls]);

  const onStepChange = useCallback<StepChangeHandler>(
    (step) => {
      void setCurrentStep(step);
    },
    [setCurrentStep],
  );

  // The step a handler starts from. Later steps are reported to it by the
  // effect below; this covers the writes a handler issues before that effect
  // first runs, such as from the Shell's own effects, which run before ours.
  const [stepAtMount] = useState(currentStep);

  const onSync = useMemo(
    () =>
      createInterviewSyncHandler({
        interviewId: payload.session.id,
        initialSyncRevision,
        initialStep: stepAtMount,
      }),
    [payload.session.id, initialSyncRevision, stepAtMount],
  );

  // The package's sync middleware captures the handler once, at store
  // creation, so the handler is told each new step rather than rebuilt with
  // it; a write records whichever step is in force when it goes on the wire.
  useEffect(() => {
    onSync.setCurrentStep(currentStep);
  }, [onSync, currentStep]);

  const [finished, setFinished] = useState(false);

  // A language chosen from the interview's own menu lasts for this interview
  // only: it is held here, never written to a researcher's account, so the
  // thank-you page can be shown in it.
  const [participantLanguage, setParticipantLanguage] = useState<string | null>(
    null,
  );
  const participantLanguageRef = useRef(participantLanguage);
  const onLocaleChange = useCallback(
    (language: string | null) => {
      participantLanguageRef.current = language;
      setParticipantLanguage(language);
      // Load the thank-you page's language now, so finishing never waits.
      void frescoCatalogSource
        .load(completionLocale(language, locale))
        .catch(() => undefined);
    },
    [locale],
  );

  const onFinish = useCallback<FinishHandler>(
    async (id, signal) => {
      const response = await fetch(`/api/interviews/${id}/finish`, {
        method: 'POST',
        signal,
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error('Your interview could not be submitted.');
      }

      setFinished(true);

      const language = participantLanguageRef.current;
      router.replace(
        language === null
          ? '/v8/interview/finished'
          : `/v8/interview/finished?language=${encodeURIComponent(language)}`,
      );
    },
    [router],
  );

  const onRequestAsset = useCallback<AssetRequestHandler>((assetId) => {
    const url = assetUrlsRef.current[assetId];
    if (!url) return Promise.reject(new Error(`No URL for asset ${assetId}`));
    return Promise.resolve(url);
  }, []);

  const flags = useMemo(
    () => ({
      isDevelopment: env.NODE_ENV === 'development',
    }),
    [],
  );

  const analytics = useMemo<InterviewAnalyticsMetadata>(
    () => ({
      installationId,
      hostApp: POSTHOG_APP_NAME,
      hostVersion: POSTHOG_APP_VERSION,
    }),
    [installationId],
  );

  if (finished) {
    return (
      <Suspense fallback={null}>
        <InterviewCompleted language={participantLanguage} />
      </Suspense>
    );
  }

  return (
    <Shell
      // Only the built-in interview controls use this request. The package
      // negotiates its own catalogs; authored protocol copy remains literal.
      // Menu choices are temporary and do not change a researcher account.
      requestedLocale={locale}
      localePreference={participantLanguage}
      onLocaleChange={onLocaleChange}
      catalog={catalog}
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      onSync={onSync}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      flags={flags}
      analytics={analytics}
      posthogClient={posthog}
      disableAnalytics={disableAnalytics}
      allowUserScaling
    />
  );
}
