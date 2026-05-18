import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createInitialNetwork,
  generateNetwork,
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';

import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { useAssetResolver } from './useAssetResolver';

const PAYLOAD_TIMEOUT_MS = 5_000;

const noopSync = async () => {};
const noopFinish = async () => {};

function buildSession(payload: PreviewPayload): SessionPayload {
  const now = new Date().toISOString();
  const network = payload.useSyntheticData
    ? generateNetwork(payload.protocol.codebook, payload.protocol.stages)
        .network
    : createInitialNetwork();
  return {
    id: uuid(),
    startTime: now,
    finishTime: null,
    exportTime: null,
    lastUpdated: now,
    network,
  };
}

export function PreviewHost() {
  const [interviewPayload, setInterviewPayload] =
    useState<InterviewPayload | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const onRequestAsset = useAssetResolver();

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryNonce is the deliberate retrigger key
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) return;

    const expectedOrigin = window.location.origin;
    let received = false;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== opener) return;
      if (event.origin !== expectedOrigin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type !== 'preview:payload') return;
      const previewPayload: PreviewPayload = event.data;
      received = true;
      setInterviewPayload({
        protocol: currentProtocolToPayload(previewPayload.protocol),
        session: buildSession(previewPayload),
      });
      setCurrentStep(previewPayload.startStage);
      setTimedOut(false);
    };

    window.addEventListener('message', onMessage);
    opener.postMessage({ type: 'preview:ready' }, expectedOrigin);

    const timeoutId = setTimeout(() => {
      if (!received) setTimedOut(true);
    }, PAYLOAD_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeoutId);
    };
  }, [retryNonce]);

  if (!window.opener) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">This preview has ended</h1>
        <p>Return to Architect and click Preview again to start a new one.</p>
        <button
          type="button"
          onClick={() => window.close()}
          className="bg-accent rounded-md px-4 py-2 text-white"
        >
          Close tab
        </button>
      </div>
    );
  }

  if (!interviewPayload && timedOut) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">
          Couldn't reach the Architect tab
        </h1>
        <p>
          The preview couldn't be loaded. The Architect tab may be closed or no
          longer responding.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setTimedOut(false);
              setRetryNonce((n) => n + 1);
            }}
            className="bg-accent rounded-md px-4 py-2 text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="bg-input-active rounded-md px-4 py-2"
          >
            Close tab
          </button>
        </div>
      </div>
    );
  }

  if (!interviewPayload) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <p>Loading preview…</p>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <Shell
        payload={interviewPayload}
        onSync={noopSync}
        onFinish={noopFinish}
        onRequestAsset={onRequestAsset}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        disableAnalytics
        analytics={{
          installationId: 'architect-preview',
          hostApp: 'architect-preview',
        }}
      />
    </div>
  );
}
