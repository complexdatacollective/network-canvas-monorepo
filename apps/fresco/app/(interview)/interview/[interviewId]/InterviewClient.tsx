'use client';

import { useRouter } from 'next/navigation';
import { parseAsInteger, useQueryState } from 'nuqs';
import posthog from 'posthog-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDebouncedSyncHandler,
  Shell,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewAnalyticsMetadata,
  type InterviewPayload,
  type StepChangeHandler,
  type SyncHandler,
} from '@codaco/interview';
import InterviewCompleted from '~/app/(interview)/interview/_components/InterviewCompleted';
import { env } from '~/env.js';
import { POSTHOG_APP_NAME, POSTHOG_APP_VERSION } from '~/fresco.config';

// Matches the interval the interview engine used to apply on every host's
// behalf, so a participant's answers reach the server at the same rate as
// before batching became this host's decision.
const SYNC_DEBOUNCE_MS = 3000;

// The fetch spec caps the combined body size of all in-flight keepalive
// requests at 64KB and fails the request rather than truncating it. Stay under
// it with room to spare.
const KEEPALIVE_MAX_BYTES = 60_000;

type Props = {
  payload: InterviewPayload;
  assetUrls: Record<string, string>;
  initialStep: number;
  installationId: string;
  disableAnalytics: boolean;
};

export default function InterviewClient({
  payload,
  assetUrls,
  initialStep,
  installationId,
  disableAnalytics,
}: Props) {
  const router = useRouter();
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

  // Every sync posts the whole network, so this host batches: the engine offers
  // a write per change, and taking all of them would put a request on the wire
  // for every answer. The wrapper still writes the first change straight away
  // and stops batching whenever the engine says the write cannot wait — the
  // participant exiting or finishing, or the tab being hidden.
  const onSync = useMemo<SyncHandler>(() => {
    let inFlight: AbortController | null = null;
    // One handler batches for one interview: it holds a single pending
    // snapshot, so a handler reused across two would let the second replace the
    // first while both sets of waiters were attached, resolving the first's
    // promise with a write that discarded its state.
    const ownerId = payload.session.id;

    return createDebouncedSyncHandler(
      async (id, session, { unloading }) => {
        if (id !== ownerId) {
          throw new Error(
            `Sync for interview ${id} reached the handler for ${ownerId}`,
          );
        }

        // Cancel any request still running. Ordinary writes are queued one
        // behind another, so the only thing that can still be here is an
        // unloading write — those are issued rather than queued, precisely so
        // they cannot be trapped behind a request dying with the document.
        // That leaves it able to outlive a newer write and, since this
        // endpoint overwrites, roll the server back to an older snapshot.
        // Cancelling unconditionally covers both orders: a newer unloading
        // write superseding an ordinary one, and — when a hidden tab is
        // reopened before its keepalive POST resolves — an ordinary write
        // superseding the unloading one.
        inFlight?.abort();

        const controller = new AbortController();
        inFlight = controller;
        const body = JSON.stringify({
          ...session,
          currentStep: currentStepRef.current,
        });

        try {
          const response = await fetch(`/interview/${id}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
            // An unloading write is the last thing that happens before the
            // document goes away, and a normal request dies with the page.
            // keepalive lets it outlive the document, but the browser caps all
            // keepalive bodies at 64KB and rejects anything larger outright,
            // which a large network exceeds. Ask for it only when the body
            // fits; a larger one falls back to an ordinary request, which still
            // survives the far more common case of the tab merely being
            // backgrounded rather than closed.
            keepalive:
              unloading && new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
          });
          if (!response.ok) throw new Error('Sync failed');
        } finally {
          if (inFlight === controller) inFlight = null;
        }
      },
      { waitMs: SYNC_DEBOUNCE_MS },
    );
  }, [payload.session.id]);

  const [finished, setFinished] = useState(false);

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

      router.replace('/interview/finished');
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
    return <InterviewCompleted />;
  }

  return (
    <Shell
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
