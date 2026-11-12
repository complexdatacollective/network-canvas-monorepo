'use client';

import { parseAsInteger, useQueryState } from 'nuqs';
import { posthog } from 'posthog-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Shell,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewAnalyticsMetadata,
  type InterviewPayload,
  type StepChangeHandler,
} from '@codaco/interview';
import { env } from '~/env.js';
import { POSTHOG_APP_NAME, POSTHOG_APP_VERSION } from '~/fresco.config';

import {
  createInterviewSyncHandler,
  type InterviewSyncHandler,
} from './createInterviewSyncHandler';
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
};

// The completed view is built from a payload with an empty network, so it must
// never write anything back: a sync would replace the stored network with that
// empty one.
const discardSync: InterviewSyncHandler = Object.assign(
  () => Promise.resolve(),
  { setCurrentStep: () => undefined },
);

export default function InterviewClient({
  payload,
  assetUrls,
  initialStep,
  initialSyncRevision,
  requestedLocales,
  installationId,
  disableAnalytics,
  view,
}: Props) {
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

  const onSync = useMemo<InterviewSyncHandler>(
    () =>
      view === 'completed'
        ? discardSync
        : createInterviewSyncHandler({
            interviewId: payload.session.id,
            initialSyncRevision,
            protocolHash: payload.protocol.hash,
            initialStep: stepAtMount,
          }),
    [
      view,
      payload.session.id,
      payload.protocol.hash,
      initialSyncRevision,
      stepAtMount,
    ],
  );

  // The package's sync middleware captures the handler once, at store
  // creation, so the handler is told each new step rather than rebuilt with
  // it; a write records whichever step is in force when it goes on the wire.
  useEffect(() => {
    onSync.setCurrentStep(currentStep);
  }, [onSync, currentStep]);

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
      openFinishedAsActive={view === 'editable-finished'}
      allowUserScaling
    />
  );
}
