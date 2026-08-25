import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createInitialNetwork,
  type FinishHandler,
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';
import {
  type ConstraintConflict,
  DEFAULT_SYNTHETIC_SEED,
  generateInterviews,
} from '@codaco/protocol-utilities';
import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { type StageMetadata, StageMetadataSchema } from '@codaco/shared-consts';
import { SyntheticConflictList } from '~/components/Synthetic/SyntheticConflictAlert';
import { assetKey } from '~/utils/assetDB';
import { hydrateMemoryAsset } from '~/utils/inMemoryAssetStore';
import { collectSyntheticAssetData } from '~/utils/syntheticAssetData';
import { isSyntheticConstraintRefusal } from '~/utils/syntheticConstraintRefusal';

import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { useAssetResolver } from './useAssetResolver';
const PAYLOAD_TIMEOUT_MS = 5000;
const noopSync = async () => {};

/**
 * The fixed end of the synthetic start window every preview generates
 * against. A preview promises that the same protocol previews the same way
 * every time, and the seed alone cannot deliver that: `generateInterviews`
 * anchors session dates — and every date-relative drawn value — to this
 * instant, falling back to the wall clock when none is given. Pinning it
 * alongside the fixed seed is what makes a rebuilt preview byte-identical to
 * the one a researcher compared against yesterday. The date itself is
 * arbitrary and visible only in generated timestamps and date answers.
 */
const PREVIEW_START_WINDOW = '2026-01-01T00:00:00.000Z';

// Shown in the interview's finish confirmation instead of the participant
// default ("…satisfied with your responses"), which is untrue in a preview:
// nothing is stored, and confirming ends the run the researcher has been
// clicking through. The dialog keeps its Cancel action, so this is the point
// at which the researcher chooses to give up that run.
const PREVIEW_FINISH_CONFIRMATION =
  'This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards.';

const COMPLETION_DESCRIPTION_ID = 'preview-finished-description';

function protocolWithoutSkipLogic(protocol: CurrentProtocol): CurrentProtocol {
  return {
    ...protocol,
    stages: protocol.stages.map(
      ({ skipLogic: _skipLogic, ...stage }) => stage as Stage,
    ),
  };
}

async function buildSession(payload: PreviewPayload): Promise<SessionPayload> {
  if (!payload.useSyntheticData) {
    const now = new Date().toISOString();
    return {
      id: uuid(),
      startTime: now,
      finishTime: null,
      exportTime: null,
      lastUpdated: now,
      network: createInitialNetwork(),
    };
  }
  // Draw roster people and Geospatial answers from the protocol's real assets.
  // Failures are isolated per-asset and never throw, so an asset problem
  // degrades to fabricated values rather than blocking the preview.
  const assetData = await collectSyntheticAssetData(
    payload.protocol,
    payload.protocolId,
  );
  const [result] = generateInterviews(
    payload.protocol,
    {
      count: 1,
      // A preview is a stage, not a study: a run that abandoned itself partway
      // would show the researcher an empty screen for reasons of its own.
      simulateDropOut: false,
      // Unconditional, including when the researcher left routing switched
      // on: they asked for THIS stage, and a generated participant whom skip
      // logic routed past it would arrive with nothing to look at. The
      // payload's `respectSkipLogic` decides how the Shell navigates the
      // preview, not how the network behind it was built.
      respectSkipLogic: false,
      // Stop on arrival at the previewed stage with nothing applied there (the
      // default prompt bound of 0), so every earlier stage has built a
      // plausible network while interaction-driven interfaces (ordinal and
      // categorical bins, sociogram) still have unplaced nodes to work with.
      stopAt: { stageIndex: payload.startStage },
      // Fixed, so the same protocol previews the same way every time: a
      // researcher comparing a change against what they saw a moment ago is
      // comparing the change, not two different draws. The seed pins the
      // draws and the start window pins the clock they are dated against —
      // without the second, date-relative answers would drift with the wall
      // clock even under a fixed seed.
      seed: DEFAULT_SYNTHETIC_SEED,
      startWindow: PREVIEW_START_WINDOW,
    },
    assetData,
  );
  if (!result) {
    throw new Error('Synthetic generation produced no interview to preview');
  }
  // Stages that record a finalized state (e.g. a FamilyPedigree's committed
  // network) do so via stageMetadata; without it they preview as never
  // finalized. Parse each entry independently so a single malformed entry is
  // dropped rather than discarding every stage's metadata. Interaction-driven
  // stages emit no metadata, so their "unplaced nodes" intent is preserved.
  let stageMetadata: StageMetadata | undefined;
  if (result.session.stageMetadata) {
    const validEntries: StageMetadata = {};
    for (const [step, entry] of Object.entries(result.session.stageMetadata)) {
      const parsed = StageMetadataSchema.safeParse({ [step]: entry });
      if (parsed.success) {
        Object.assign(validEntries, parsed.data);
      }
    }
    stageMetadata = validEntries;
  }
  return { ...result.session, stageMetadata };
}

// A preview fails for exactly one reason — the payload never arrived, or the
// build it started failed — so the reasons share one slot: a later failure can
// never leave an earlier one's screen behind. A payload that arrives is no
// longer a timeout, so recording its outcome is what retires the timeout.
type PreviewFailure =
  | { kind: 'timeout' }
  | { kind: 'constraints'; conflicts: readonly ConstraintConflict[] }
  | { kind: 'processing' };
export function PreviewHost() {
  const [interviewPayload, setInterviewPayload] =
    useState<InterviewPayload | null>(null);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [failure, setFailure] = useState<PreviewFailure | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  // Set when the interview's finish confirmation completes. The preview has no
  // store to write a finish time to, so this is the only record that the
  // completion event was handled — and rendering it in place of the Shell is
  // what stops Finish being confirmable a second time.
  const [finished, setFinished] = useState(false);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  // Index of the stage receiving a one-stage preview override, or null.
  const [initialStageOverrideIndex, setInitialStageOverrideIndex] = useState<
    number | null
  >(null);
  const onRequestAsset = useAssetResolver(protocolId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryNonce is the deliberate retrigger key
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) return;
    const expectedOrigin = window.location.origin;
    let received = false;
    let cancelled = false;
    const processPayload = async (previewPayload: PreviewPayload) => {
      let nextPayload: InterviewPayload;
      try {
        // Resolve the protocol payload first (a throw here means an invalid
        // protocol shape), then build the session, which is async because
        // synthetic previews fetch and parse the protocol's roster assets.
        const previewProtocol = previewPayload.respectSkipLogic
          ? previewPayload.protocol
          : protocolWithoutSkipLogic(previewPayload.protocol);
        const protocol = currentProtocolToPayload(previewProtocol);
        const session = await buildSession(previewPayload);
        if (cancelled) return;
        nextPayload = { protocol, session };
      } catch (error) {
        if (cancelled) return;
        // Clear any previously successful preview so a failed rebuild never
        // leaves a stale network on screen with no sign that this build failed.
        setInterviewPayload(null);
        if (isSyntheticConstraintRefusal(error)) {
          setFailure({ kind: 'constraints', conflicts: error.conflicts });
        } else {
          console.error('Failed to build preview payload', error);
          setFailure({ kind: 'processing' });
        }
        return;
      }
      setFailure(null);
      setInterviewPayload(nextPayload);
      setProtocolId(previewPayload.protocolId);
      setCurrentStep(previewPayload.startStage);
      setInitialStageOverrideIndex(
        previewPayload.respectSkipLogic ? previewPayload.startStage : null,
      );
    };
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
      // The payload message arrived — the handshake succeeded, so disarm the
      // "couldn't reach Architect" timeout. If it already fired, processPayload
      // replaces that state with this build's own outcome.
      received = true;
      void processPayload(previewPayload);
    };
    window.addEventListener('message', onMessage);
    opener.postMessage({ type: 'preview:ready' }, expectedOrigin);
    const timeoutId = setTimeout(() => {
      if (!received) setFailure({ kind: 'timeout' });
    }, PAYLOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timeoutId);
    };
  }, [retryNonce]);
  // The Shell unmounts in the same commit that sets `finished`, taking the
  // Finish button — and the whole interview — with it, so focus would
  // otherwise be dropped on <body> with nothing announced. Move it to the
  // completion heading, which is described by the "nothing was saved"
  // paragraph so both sentences are spoken together.
  useEffect(() => {
    if (!finished) return;
    completionHeadingRef.current?.focus();
  }, [finished]);
  const handleFinish = useCallback<FinishHandler>(async () => {
    setFinished(true);
  }, []);
  // Re-run the handshake: the opener answers `preview:ready` with the payload
  // it captured at launch, and processPayload rebuilds a fresh session from it.
  //
  // This is the only way out of `finished`, and it clears the flag itself
  // rather than leaving that to processPayload — the completion screen
  // outranks the failure screens below, so a restart that then times out would
  // otherwise sit on a finished interview with no sign that the rebuild never
  // arrived. Dropping the payload too means the interim screen is "Loading
  // preview…", not the spent interview with a Finish that can no longer do
  // anything.
  const restartPreview = () => {
    setFinished(false);
    setFailure(null);
    setInterviewPayload(null);
    setRetryNonce((n) => n + 1);
  };
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
  // Deliberately below the closed-opener branch: without an opener there is
  // nothing to restart from, so "This preview has ended" is the truthful
  // screen even for a run that finished first.
  if (finished) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Heading
          ref={completionHeadingRef}
          tabIndex={-1}
          level="h1"
          margin="none"
          className="text-2xl font-semibold"
          aria-describedby={COMPLETION_DESCRIPTION_ID}
        >
          Preview finished
        </Heading>
        <Paragraph
          id={COMPLETION_DESCRIPTION_ID}
          margin="none"
          className="max-w-xl"
        >
          The interview finished, just as it would for a participant. Nothing
          was saved — preview responses are never stored.
        </Paragraph>
        <Paragraph
          margin="none"
          intent="smallText"
          emphasis="muted"
          className="max-w-xl"
        >
          Starting again reruns the protocol as it was when this preview opened.
          To preview changes you have made in Architect since then, start a new
          preview from there.
        </Paragraph>
        <div className="flex gap-3">
          <Button color="primary" onClick={restartPreview}>
            Start the preview again
          </Button>
          <Button color="default" onClick={() => window.close()}>
            Close tab
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload && failure?.kind === 'timeout') {
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
              setFailure(null);
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
  if (!interviewPayload && failure?.kind === 'constraints') {
    return (
      <div className="flex h-dvh w-full flex-col items-center gap-4 overflow-y-auto p-8 pt-16 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          This protocol can't be previewed
        </Heading>
        <Paragraph margin="none" className="max-w-xl">
          Synthetic data couldn't be generated because these validation rules
          can't all be satisfied. Return to Architect, update the protocol, and
          preview it again.
        </Paragraph>
        <div className="w-full max-w-xl text-left">
          <SyntheticConflictList conflicts={failure.conflicts} />
        </div>
        <Button color="primary" onClick={() => window.close()}>
          Close tab
        </Button>
      </div>
    );
  }
  if (!interviewPayload && failure?.kind === 'processing') {
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
              setFailure(null);
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
      <Shell
        payload={interviewPayload}
        onSync={noopSync}
        onFinish={handleFinish}
        finishConfirmationDescription={PREVIEW_FINISH_CONFIRMATION}
        onRequestAsset={onRequestAsset}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        flags={{ isDevelopment: import.meta.env.DEV }}
        initialStageOverrideIndex={initialStageOverrideIndex ?? undefined}
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
