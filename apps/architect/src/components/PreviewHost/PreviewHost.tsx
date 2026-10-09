import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createInitialNetwork,
  type FinishHandler,
  type InterviewPayload,
  type ProtocolLocaleChangeHandler,
  type SessionPayload,
  Shell,
  type SyncHandler,
} from '@codaco/interview';
import { loadInterviewCatalog } from '@codaco/interview/catalog';
import { currentProtocolToPayload } from '@codaco/interview/contract';
import {
  type ConstraintConflict,
  generateNetwork,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';
import { formatConstraintConflictReason } from '@codaco/protocol-utilities/messages';
import {
  type CurrentProtocol,
  getLocaleMetadata,
  type LocaleTag,
  selectProtocolLocale,
  type Stage,
} from '@codaco/protocol-validation';
import { type StageMetadata, StageMetadataSchema } from '@codaco/shared-consts';
import { assetKey } from '~/utils/assetDB';
import { hydrateMemoryAsset } from '~/utils/inMemoryAssetStore';
import { reportError } from '~/utils/reportError';

import { isPreviewMessage, type PreviewPayload } from './messages';
import { collectPreviewRosterData } from './previewRosterData';
import PreviewToolbar from './PreviewToolbar';
import { ShellLanguageMessage } from './ShellLanguageMessage';
import { useAssetResolver } from './useAssetResolver';
const messages = defineMessages({
  finishConfirmation: {
    id: 'architect.previewHost.previewHost.finishConfirmation',
    defaultMessage:
      'This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards.',
    description:
      'Preview-specific finish confirmation inside the interview Shell. Preview answers are never saved, and the researcher can restart the run after finishing.',
  },
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

// The interview chooses its language from the browser's languages, never from
// Architect's own interface language.
function readBrowserLanguages(): readonly string[] {
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

// Shown in the interview's finish confirmation instead of the participant
// default ("…satisfied with your responses"), which is untrue in a preview:
// nothing is stored, and confirming ends the run the researcher has been
// clicking through. The dialog keeps its Cancel action, so this is the point
// at which the researcher chooses to give up that run.
function PreviewFinishConfirmation() {
  return <ShellLanguageMessage message={messages.finishConfirmation} />;
}

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
    // Each run starts as it would for a participant with this browser: no
    // language stated yet.
    localePreference: null,
    locale: null,
    localeOptions: payload.protocol.localization.locales.map((locale) =>
      getLocaleMetadata(locale),
    ),
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
  // Stages that record a finalized state (e.g. a census's recorded
  // answers) do so via stageMetadata; without it they preview as never
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
  // Index of the stage receiving a one-stage preview override, or null.
  const [initialStageOverrideIndex, setInitialStageOverrideIndex] = useState<
    number | null
  >(null);
  const onRequestAsset = useAssetResolver(protocolId);
  const [browserLanguages] = useState(readBrowserLanguages);
  // The language this preview states, held only while the window is open: the
  // author's choice in the toolbar, or one a language chooser stage stated.
  // Null follows the browser.
  const [statedLocale, setStatedLocale] = useState<LocaleTag | null>(null);
  // Whether the running interview holds a preference in its own store, stated
  // by a language chooser stage. Requested languages cannot override one, so
  // from then on the toolbar's choice is stated to the interview instead.
  const [preferenceHeld, setPreferenceHeld] = useState(false);
  // The interview's messages load during the handshake and the synthetic
  // network build, rather than once the Shell mounts, in the language the
  // Shell will negotiate from the same inputs. A failure here is retried by
  // the Shell itself.
  useEffect(() => {
    loadInterviewCatalog(browserLanguages, statedLocale).catch(() => undefined);
  }, [browserLanguages, statedLocale]);
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
        const protocol = currentProtocolToPayload(previewProtocol, {
          id: uuid(),
          importedAt: new Date().toISOString(),
        });
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
          reportError(error, { operation: 'previewBuild' });
          setFailure({ kind: 'processing' });
        }
        return;
      }
      setFailure(null);
      setInterviewPayload(nextPayload);
      setStatedLocale(null);
      setPreferenceHeld(false);
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
  // Nothing in a preview is saved, so there is no finish to record. Once this
  // resolves the interview shows its completed state, as it would for a
  // participant, and Finish cannot be confirmed a second time.
  const handleFinish = useCallback<FinishHandler>(async () => {}, []);
  // Nothing in a preview is saved.
  const handleSync = useCallback<SyncHandler>(async () => {}, []);
  // A language chooser stage stated a preference: the toolbar follows it.
  // Calls that only record the language shown carry no preference.
  const handleProtocolLocaleChange = useCallback<ProtocolLocaleChangeHandler>(
    async (_interviewId, { localePreference }) => {
      if (localePreference === null) return;
      setPreferenceHeld(true);
      setStatedLocale(localePreference);
    },
    [],
  );
  // The Shell applies a change of requested languages in place, keeping the
  // step, answers and unsaved input, so the stated language is passed as the
  // first requested one.
  const requestedLocales = useMemo(
    () =>
      statedLocale === null
        ? browserLanguages
        : [statedLocale, ...browserLanguages],
    [statedLocale, browserLanguages],
  );
  // Once the interview holds a preference, the toolbar states its choice to
  // the interview in place of that one, as a language chooser stage would:
  // re-creating the interview instead would lose the prompt reached and any
  // answer still in an unsubmitted form.
  const changePreviewLocale = (locale: LocaleTag) => {
    setStatedLocale(locale);
  };
  // Re-run the handshake: the opener answers `preview:ready` with the payload
  // it captured at launch, and processPayload rebuilds a fresh session from it.
  //
  // The way out of a finished run, offered as the completed state's action.
  // Dropping the payload means the interim screen is "Loading preview…", not
  // the finished interview, and a restart that then times out shows that
  // failure rather than the run it left.
  const restartPreview = useCallback(() => {
    setFailure(null);
    setInterviewPayload(null);
    setRetryNonce((n) => n + 1);
  }, []);
  const completedActions = useMemo(
    () => [
      {
        label: <ShellLanguageMessage message={messages.startThePreviewAgain} />,
        onAction: restartPreview,
      },
    ],
    [restartPreview],
  );
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
  // The language the interview shows, chosen as the interview chooses it.
  const shownLocale = selectProtocolLocale(
    statedLocale === null ? browserLanguages : [statedLocale],
    interviewPayload.protocol.localization,
  );
  return (
    <div className="flex h-screen flex-col">
      <PreviewToolbar
        options={interviewPayload.session.localeOptions}
        value={shownLocale}
        onChange={changePreviewLocale}
      />
      <div className="min-h-0 flex-1">
        <Shell
          requestedLocales={requestedLocales}
          statedLocale={
            preferenceHeld && statedLocale !== null ? statedLocale : undefined
          }
          payload={interviewPayload}
          onSync={handleSync}
          onProtocolLocaleChange={handleProtocolLocaleChange}
          onFinish={handleFinish}
          finishConfirmationDescription={<PreviewFinishConfirmation />}
          completedActions={completedActions}
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
    </div>
  );
}
