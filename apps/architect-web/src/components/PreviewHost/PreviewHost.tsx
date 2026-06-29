import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import {
  createInitialNetwork,
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';
import { generateNetwork } from '@codaco/protocol-utilities';
import StageTypeImage from '~/components/StageTypeImage';
import Button from '~/lib/legacy-ui/components/Button';

import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { useAssetResolver } from './useAssetResolver';

const PAYLOAD_TIMEOUT_MS = 5_000;

const noopSync = async () => {};
const noopFinish = async () => {};

function buildSession(payload: PreviewPayload): SessionPayload {
  const now = new Date().toISOString();
  const network = payload.useSyntheticData
    ? generateNetwork(payload.protocol.codebook, payload.protocol.stages, {
        // Leave the previewed stage partially complete so interaction-driven
        // interfaces (ordinal/categorical bins, sociogram) still have
        // unplaced nodes to work with.
        inProgressStageIndex: payload.startStage,
      }).network
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
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // Index of the stage whose skip logic was bypassed for preview, or null.
  // The notice only shows while that stage is the one being viewed.
  const [bypassedStageIndex, setBypassedStageIndex] = useState<number | null>(
    null,
  );
  const [skipLogicNoticeDismissed, setSkipLogicNoticeDismissed] =
    useState(false);
  const [allowStageNavigation, setAllowStageNavigation] = useState(false);
  const onRequestAsset = useAssetResolver(protocolId);

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
      setProtocolId(previewPayload.protocolId);
      setCurrentStep(previewPayload.startStage);
      setBypassedStageIndex(
        previewPayload.skipLogicBypassed ? previewPayload.startStage : null,
      );
      setAllowStageNavigation(previewPayload.allowStageNavigation);
      setSkipLogicNoticeDismissed(false);
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
        <Button color="sea-green" onClick={() => window.close()}>
          Close tab
        </Button>
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
          <Button
            color="sea-green"
            onClick={() => {
              setTimedOut(false);
              setRetryNonce((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Button color="platinum" onClick={() => window.close()}>
            Close tab
          </Button>
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
      {currentStep === bypassedStageIndex && !skipLogicNoticeDismissed && (
        <div className="fixed right-8 bottom-6 z-50 max-w-sm">
          <Alert variant="info" icon={false} className="my-0">
            <AlertDescription className="pr-10 text-sm">
              This stage has skip logic, so depending on a participant’s
              responses it may not be shown during an interview.
            </AlertDescription>
            <CloseButton
              size="sm"
              onClick={() => setSkipLogicNoticeDismissed(true)}
              className="absolute top-2 right-2"
            />
          </Alert>
        </div>
      )}
      <Shell
        payload={interviewPayload}
        onSync={noopSync}
        onFinish={noopFinish}
        onRequestAsset={onRequestAsset}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        allowStageNavigation={allowStageNavigation}
        renderStagePreview={(type) => (
          <StageTypeImage
            type={type}
            ratio="16:9"
            sizes="8rem"
            alt=""
            className="size-full object-cover"
          />
        )}
        disableAnalytics
        analytics={{
          installationId: 'architect-preview',
          hostApp: 'architect-preview',
        }}
      />
    </div>
  );
}
