'use client';

import { parseAsInteger, useQueryState } from 'nuqs';
import posthog from 'posthog-js';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  Shell,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewAnalyticsMetadata,
  type InterviewPayload,
  type ProtocolLocaleChangeHandler,
  type StepChangeHandler,
  type SyncHandler,
} from '@codaco/interview';
import type { InterviewCatalog } from '@codaco/interview/catalog';
import { env } from '~/env.js';
import { POSTHOG_APP_NAME, POSTHOG_APP_VERSION } from '~/fresco.config';

import { createInterviewSyncHandler } from './createInterviewSyncHandler';
import { createProtocolLocaleChangeHandler } from './createProtocolLocaleChangeHandler';
import type { InterviewView } from './mapInterviewPayload';

type Props = {
  payload: InterviewPayload;
  assetUrls: Record<string, string>;
  initialStep: number;
  initialSyncRevision: number;
  requestedLocales: readonly string[];
  installationId: string;
  disableAnalytics: boolean;
  view: InterviewView;
  catalog: InterviewCatalog;
};

// The completed view is built from a payload with an empty network, so it must
// never write anything back: a sync would replace the stored network with that
// empty one.
const discardSync: SyncHandler = () => Promise.resolve();
const discardLocaleChange: ProtocolLocaleChangeHandler = () =>
  Promise.resolve();

export default function InterviewClient({
  payload,
  assetUrls,
  initialStep,
  initialSyncRevision,
  requestedLocales,
  installationId,
  disableAnalytics,
  view,
  catalog,
}: Props) {
  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(initialStep).withOptions({ history: 'push' }),
  );

  // Refs let onSync read the latest values even though the package's sync
  // middleware captures the handler once at store creation time.
  const currentStepRef = useRef(currentStep);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

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

  const onSync = useMemo<SyncHandler>(
    () =>
      view === 'completed'
        ? discardSync
        : createInterviewSyncHandler({
            interviewId: payload.session.id,
            initialSyncRevision,
            // Read through the ref, not the render's value: the memo runs once, and
            // the step a write should record is the one in force when it goes on
            // the wire.
            getCurrentStep: () => currentStepRef.current,
          }),
    [view, payload.session.id, initialSyncRevision],
  );

  const onProtocolLocaleChange = useMemo<ProtocolLocaleChangeHandler>(
    () =>
      view === 'completed'
        ? discardLocaleChange
        : createProtocolLocaleChangeHandler(),
    [view],
  );

  // Once this resolves the Shell shows the interview's completed state in
  // place, so there is nothing to navigate to. A refused finish throws, which
  // the Shell's confirmation dialog reports and lets the participant retry.
  const onFinish = useCallback<FinishHandler>(
    async (id, { stageId, outcome }, signal) => {
      const response = await fetch(`/api/interviews/${id}/finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId, outcome }),
        signal,
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error('Your interview could not be submitted.');
      }
    },
    [],
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

  return (
    <Shell
      requestedLocales={requestedLocales}
      catalog={catalog}
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      onSync={onSync}
      onProtocolLocaleChange={onProtocolLocaleChange}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      flags={flags}
      analytics={analytics}
      posthogClient={posthog}
      disableAnalytics={disableAnalytics}
      openFinishedAsActive={view === 'editable-finished'}
      allowUserScaling
    />
  );
}
