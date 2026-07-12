import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createInitialNetwork,
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';
import { generateNetwork } from '@codaco/protocol-utilities';
import { type StageMetadata, StageMetadataSchema } from '@codaco/shared-consts';
import { assetKey } from '~/utils/assetDB';
import { hydrateMemoryAsset } from '~/utils/inMemoryAssetStore';

import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { useAssetResolver } from './useAssetResolver';
const PAYLOAD_TIMEOUT_MS = 5000;
const noopSync = async () => {};
const noopFinish = async () => {};
function buildSession(payload: PreviewPayload): SessionPayload {
  const now = new Date().toISOString();
  const base: SessionPayload = {
    id: uuid(),
    startTime: now,
    finishTime: null,
    exportTime: null,
    lastUpdated: now,
    network: createInitialNetwork(),
  };
  if (!payload.useSyntheticData) {
    return base;
  }
  const generated = generateNetwork(
    payload.protocol.codebook,
    payload.protocol.stages,
    {
      // Leave the previewed stage partially complete so interaction-driven
      // interfaces (ordinal/categorical bins, sociogram) still have
      // unplaced nodes to work with.
      inProgressStageIndex: payload.startStage,
    },
  );
  // Stages that record a finalized state (e.g. a FamilyPedigree's committed
  // network) do so via stageMetadata; without it they preview as never
  // finalized. Parse each entry independently so a single malformed entry is
  // dropped rather than discarding every stage's metadata. Interaction-driven
  // stages emit no metadata, so their "unplaced nodes" intent is preserved.
  let stageMetadata: StageMetadata | undefined;
  if (generated.stageMetadata) {
    const validEntries: StageMetadata = {};
    for (const [stageId, entry] of Object.entries(generated.stageMetadata)) {
      const parsed = StageMetadataSchema.safeParse({ [stageId]: entry });
      if (parsed.success) {
        Object.assign(validEntries, parsed.data);
      }
    }
    stageMetadata = validEntries;
  }
  return {
    ...base,
    network: generated.network,
    stageMetadata,
  };
}
export function PreviewHost() {
  const [interviewPayload, setInterviewPayload] =
    useState<InterviewPayload | null>(null);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [processingFailed, setProcessingFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // Index of the stage whose skip logic was bypassed for preview, or null.
  // The notice only shows while that stage is the one being viewed.
  const [bypassedStageIndex, setBypassedStageIndex] = useState<number | null>(
    null,
  );
  const [skipLogicNoticeDismissed, setSkipLogicNoticeDismissed] =
    useState(false);
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
      // Hydrate this realm's in-memory store with any Safari-private fallback
      // assets ferried from the editor. getAssetById reads IndexedDB first, then
      // this map, so once hydrated the resolver finds them like any other asset.
      for (const asset of previewPayload.memoryAssets ?? []) {
        hydrateMemoryAsset({
          id: assetKey(previewPayload.protocolId, asset.assetId),
          assetId: asset.assetId,
          protocolId: previewPayload.protocolId,
          name: asset.name,
          data: asset.data,
        });
      }
      let nextPayload: InterviewPayload;
      try {
        // Build the payload before marking the handshake received: a throw here
        // (invalid protocol shape, synthetic-network generation) must surface an
        // error rather than leave the loader stuck forever.
        nextPayload = {
          protocol: currentProtocolToPayload(previewPayload.protocol),
          session: buildSession(previewPayload),
        };
      } catch (error) {
        console.error('Failed to build preview payload', error);
        received = true;
        setProcessingFailed(true);
        return;
      }
      received = true;
      setProcessingFailed(false);
      setInterviewPayload(nextPayload);
      setProtocolId(previewPayload.protocolId);
      setCurrentStep(previewPayload.startStage);
      setBypassedStageIndex(
        previewPayload.skipLogicBypassed ? previewPayload.startStage : null,
      );
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
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          This preview has ended
        </Heading>
        <Paragraph margin="none">
          Return to Architect and click Preview again to start a new one.
        </Paragraph>
        <Button color="primary" onClick={() => window.close()}>
          Close tab
        </Button>
      </div>
    );
  }
  if (!interviewPayload && timedOut) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          Couldn't reach the Architect tab
        </Heading>
        <Paragraph margin="none">
          The preview couldn't be loaded. The Architect tab may be closed or no
          longer responding.
        </Paragraph>
        <div className="flex gap-3">
          <Button
            color="primary"
            onClick={() => {
              setTimedOut(false);
              setRetryNonce((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Button color="default" onClick={() => window.close()}>
            Close tab
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload && processingFailed) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          Couldn't build the preview
        </Heading>
        <Paragraph margin="none">
          Something went wrong preparing this protocol for preview. Return to
          Architect, check the protocol, and try again.
        </Paragraph>
        <div className="flex gap-3">
          <Button
            color="primary"
            onClick={() => {
              setProcessingFailed(false);
              setRetryNonce((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Button color="default" onClick={() => window.close()}>
            Close tab
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <Paragraph>Loading preview…</Paragraph>
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
        allowStageNavigation
        disableAnalytics
        analytics={{
          installationId: 'architect-preview',
          hostApp: 'architect-preview',
        }}
      />
    </div>
  );
}
