import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
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
  generateNetwork,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';
import { formatConstraintConflictReason } from '@codaco/protocol-utilities/messages';
import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { type StageMetadata, StageMetadataSchema } from '@codaco/shared-consts';
import { assetKey } from '~/utils/assetDB';
import { hydrateMemoryAsset } from '~/utils/inMemoryAssetStore';

import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { collectPreviewRosterData } from './previewRosterData';
import { useAssetResolver } from './useAssetResolver';
const chromeMessages = defineMessages({
  english: {
    id: 'architect.chrome.previewHost.previewHost.english',
    defaultMessage: 'English',
    description: 'The label text in components / PreviewHost / PreviewHost.',
  },
});
const messages = defineMessages({
  conflictSubject: {
    id: 'architect.presentation.conflictSubject',
    defaultMessage: '{entityName}: {variableNames}',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  thisPreviewHasEnded: {
    id: 'architect.previewHost.previewHost.thisPreviewHasEnded',
    defaultMessage: 'This preview has ended',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  returnToArchitectAndClickPreview: {
    id: 'architect.previewHost.previewHost.returnToArchitectAndClickPreview',
    defaultMessage:
      'Return to Architect and click Preview again to start a new one.',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  closeTab: {
    id: 'architect.previewHost.previewHost.closeTab',
    defaultMessage: 'Close tab',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  previewFinished: {
    id: 'architect.previewHost.previewHost.previewFinished',
    defaultMessage: 'Preview finished',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  theInterviewFinishedJustAsIt: {
    id: 'architect.previewHost.previewHost.theInterviewFinishedJustAsIt',
    defaultMessage:
      'The interview finished, just as it would for a participant. Nothing was saved — preview responses are never stored.',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  startingAgainRerunsTheProtocolAs: {
    id: 'architect.previewHost.previewHost.startingAgainRerunsTheProtocolAs',
    defaultMessage:
      'Starting again reruns the protocol as it was when this preview opened. To preview changes you have made in Architect since then, start a new preview from there.',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  startThePreviewAgain: {
    id: 'architect.previewHost.previewHost.startThePreviewAgain',
    defaultMessage: 'Start the preview again',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  couldnTReachTheArchitectTab: {
    id: 'architect.previewHost.previewHost.couldnTReachTheArchitectTab',
    defaultMessage: "Couldn't reach the Architect tab",
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  thePreviewCouldnTBeLoadedThe: {
    id: 'architect.previewHost.previewHost.thePreviewCouldnTBeLoadedThe',
    defaultMessage:
      "The preview couldn't be loaded. The Architect tab may be closed or no longer responding.",
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  thisProtocolCanTBePreviewed: {
    id: 'architect.previewHost.previewHost.thisProtocolCanTBePreviewed',
    defaultMessage: "This protocol can't be previewed",
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  syntheticDataCouldnTBeGeneratedBecause: {
    id: 'architect.previewHost.previewHost.syntheticDataCouldnTBeGeneratedBecause',
    defaultMessage:
      "Synthetic data couldn't be generated because these validation rules can't all be satisfied. Return to Architect, update the protocol, and preview it again.",
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  ego: {
    id: 'architect.previewHost.previewHost.ego',
    defaultMessage: 'Ego',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  couldnTBuildThePreview: {
    id: 'architect.previewHost.previewHost.couldnTBuildThePreview',
    defaultMessage: "Couldn't build the preview",
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  somethingWentWrongPreparingThisProtocol: {
    id: 'architect.previewHost.previewHost.somethingWentWrongPreparingThisProtocol',
    defaultMessage:
      'Something went wrong preparing this protocol for preview. Return to Architect, check the protocol, and try again.',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
  loadingPreview: {
    id: 'architect.previewHost.previewHost.loadingPreview',
    defaultMessage: 'Loading preview…',
    description: 'Visible text in components / PreviewHost / PreviewHost.',
  },
});
const extraMessages = defineMessages({
  thisType: {
    id: 'architect.preview.constraints.thisType',
    defaultMessage: 'This type',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const PAYLOAD_TIMEOUT_MS = 5000;
const noopSync = async () => {};

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
  // Draw roster-stage people from the protocol's real roster assets. Failures
  // are isolated per-asset and never throw, so a roster problem degrades to
  // fabricated people rather than blocking the preview.
  const externalData = await collectPreviewRosterData(
    payload.protocol,
    payload.protocolId,
  );
  const generated = generateNetwork({
    codebook: payload.protocol.codebook,
    stages: payload.protocol.stages,
    externalData,
    // Leave the previewed stage partially complete so interaction-driven
    // interfaces (ordinal/categorical bins, sociogram) still have
    // unplaced nodes to work with.
    inProgressStageIndex: payload.startStage,
  });
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
// A preview fails for exactly one reason — the payload never arrived, or the
// build it started failed — so the reasons share one slot: a later failure can
// never leave an earlier one's screen behind. A payload that arrives is no
// longer a timeout, so recording its outcome is what retires the timeout.
type PreviewFailure =
  | { kind: 'timeout' }
  | { kind: 'constraints'; conflicts: ConstraintConflict[] }
  | { kind: 'processing' };
export function PreviewHost() {
  const intl = useAppIntl();
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
        if (error instanceof SyntheticDataConstraintError) {
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
          {intl.formatMessage(messages.thisPreviewHasEnded)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.returnToArchitectAndClickPreview)}
        </Paragraph>
        <Button color="primary" onClick={() => window.close()}>
          {intl.formatMessage(messages.closeTab)}
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
          {intl.formatMessage(messages.previewFinished)}
        </Heading>
        <Paragraph
          id={COMPLETION_DESCRIPTION_ID}
          margin="none"
          className="max-w-xl"
        >
          {intl.formatMessage(messages.theInterviewFinishedJustAsIt)}
        </Paragraph>
        <Paragraph
          margin="none"
          intent="smallText"
          emphasis="muted"
          className="max-w-xl"
        >
          {intl.formatMessage(messages.startingAgainRerunsTheProtocolAs)}
        </Paragraph>
        <div className="flex gap-3">
          <Button color="primary" onClick={restartPreview}>
            {intl.formatMessage(messages.startThePreviewAgain)}
          </Button>
          <Button color="default" onClick={() => window.close()}>
            {intl.formatMessage(messages.closeTab)}
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload && failure?.kind === 'timeout') {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          {intl.formatMessage(messages.couldnTReachTheArchitectTab)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.thePreviewCouldnTBeLoadedThe)}
        </Paragraph>
        <div className="flex gap-3">
          <Button
            color="primary"
            onClick={() => {
              setFailure(null);
              setRetryNonce((n) => n + 1);
            }}
          >
            {intl.formatMessage(commonMessages.retry)}
          </Button>
          <Button color="default" onClick={() => window.close()}>
            {intl.formatMessage(messages.closeTab)}
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload && failure?.kind === 'constraints') {
    return (
      <div className="flex h-dvh w-full flex-col items-center gap-4 overflow-y-auto p-8 pt-16 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          {intl.formatMessage(messages.thisProtocolCanTBePreviewed)}
        </Heading>
        <Paragraph margin="none" className="max-w-xl">
          {intl.formatMessage(messages.syntheticDataCouldnTBeGeneratedBecause)}
        </Paragraph>
        <div className="flex w-full max-w-xl flex-col gap-3 text-left">
          {failure.conflicts.map((conflict, index) => (
            <Alert
              key={`${conflict.entity}-${conflict.variableIds.join(',')}-${index}`}
              variant="destructive"
              density="compact"
            >
              <AlertTitle>
                {intl.formatMessage(messages.conflictSubject, {
                  entityName:
                    conflict.entity === 'ego'
                      ? intl.formatMessage(messages.ego)
                      : (conflict.entityTypeName ??
                        intl.formatMessage(extraMessages.thisType)),
                  variableNames: intl.formatList(conflict.variableNames),
                })}
              </AlertTitle>
              <AlertDescription>
                {formatConstraintConflictReason(conflict, intl)}
              </AlertDescription>
            </Alert>
          ))}
        </div>
        <Button color="primary" onClick={() => window.close()}>
          {intl.formatMessage(messages.closeTab)}
        </Button>
      </div>
    );
  }
  if (!interviewPayload && failure?.kind === 'processing') {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Heading level="h1" margin="none" className="text-2xl font-semibold">
          {intl.formatMessage(messages.couldnTBuildThePreview)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.somethingWentWrongPreparingThisProtocol)}
        </Paragraph>
        <div className="flex gap-3">
          <Button
            color="primary"
            onClick={() => {
              setFailure(null);
              setRetryNonce((n) => n + 1);
            }}
          >
            {intl.formatMessage(commonMessages.retry)}
          </Button>
          <Button color="default" onClick={() => window.close()}>
            {intl.formatMessage(messages.closeTab)}
          </Button>
        </div>
      </div>
    );
  }
  if (!interviewPayload) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <Paragraph>{intl.formatMessage(messages.loadingPreview)}</Paragraph>
      </div>
    );
  }
  return (
    <div className="h-screen" lang="en" dir="ltr">
      {/* Protocol/participant language is independent of Architect chrome.
          Schema-8 previews retain their source English runtime until #1313. */}
      <AppI18nProvider
        locale="en"
        locales={[
          {
            locale: 'en',
            label: intl.formatMessage(chromeMessages.english),
            direction: 'ltr',
          },
        ]}
        manageDocument={false}
      >
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
      </AppI18nProvider>
    </div>
  );
}
