import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createDebouncedSyncHandler,
  type FinishHandler,
  type InterviewPayload,
  type SessionPayload,
  Shell,
  type StepChangeHandler,
  type SyncHandler,
  getLastAvailableAuthoredStageIndex,
} from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { InterviewComplete } from '~/components/InterviewComplete';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { POSTHOG_APP_KEY, POSTHOG_APP_NAME } from '~/lib/analytics/config';
import { APP_VERSION } from '~/lib/appVersion';
import {
  buildResolvedAssets,
  makeAssetResolver,
} from '~/lib/assets/assetResolver';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  getProtocolByHash,
  getSession,
  getSettings,
  markSessionFinished,
  updateSession,
  updateSettings,
} from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import { getInstallationId } from '~/lib/installationId';
import { useHistoryBackGuard } from '~/lib/pwa/useHistoryBackGuard';

// Inset the vertical navigation rail past the top device safe area so, on an
// installed PWA, its buttons stay clear of the status bar / iPadOS window
// controls while the rail's background still meets the screen edge. `calc`
// keeps the navigation surface's own py-3 (0.75rem); env() insets are 0 off a
// safe-area device, so browser/desktop are unchanged. The bottom inset is
// deliberately not added (in either orientation): the home indicator floating
// over the navigation's base padding reads better than the enlarged bottom
// band the extra inset produced (#1186).
const NAVIGATION_SAFE_AREA_CLASSNAMES = {
  vertical: 'pt-[calc(0.75rem_+_env(safe-area-inset-top))]',
} as const;

// Zero: this host never holds an answer on a timer. Anything held is an answer
// that only the vault's encryption key can write, and the key is cleared on
// idle lock — a wait here is a window in which answers can be lost.
//
// The wrapper still earns its place at zero, because collapsing does not come
// from the wait. Writes go through its queue one at a time, and a change
// arriving while one is on the wire replaces the pending snapshot rather than
// queueing another write. An automatic-layout settle dispatches an update per
// node, so a twenty-alter sociogram becomes two writes instead of twenty
// re-encryptions of the whole network. The only unwritten window is the
// duration of a write already in progress — exactly what writing eagerly
// would leave, and no more.
const SYNC_BATCH_MS = 0;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'incompatible' }
  | {
      kind: 'ready';
      payload: InterviewPayload;
      resolver: (id: string) => Promise<string>;
      readOnly: boolean;
      initialStageOverrideIndex?: number;
    };

const discardSessionChanges: SyncHandler = () => Promise.resolve();
const discardFinish: FinishHandler = () => Promise.resolve();

export function InterviewRoute({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [, navigate] = useLocation();
  const search = useSearch();
  const reviewRequested = new URLSearchParams(search).get('mode') === 'review';
  const {
    requireFreshUnlock,
    getAuthorizedInterviewId,
    setAuthorizedInterviewId,
  } = useStepUpAuth();
  // App.tsx's AnimatePresence page transition keeps this route mounted — with
  // live context subscriptions and effects — while its exit fade plays after
  // navigation away. The load effect must treat that window as inert:
  // re-running the enter gate there raises a step-up prompt over Home that
  // nothing ever resolves, and re-writing the entry authorization re-arms what
  // the gated exit just cleared.
  const [interviewRouteMatches, interviewRouteParams] = useRoute(
    '/interview/:sessionId',
  );
  const isLiveRoute =
    interviewRouteMatches && interviewRouteParams.sessionId === sessionId;
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [allowStageNavigation, setAllowStageNavigation] = useState(false);
  // SessionPayload from @codaco/interview's onSync does not carry the current
  // step. Mirror it into a ref so handleSync sees the latest value rather
  // than the stale closure value.
  const currentStepRef = useRef(0);

  // A history-back (browser button or a swipe gesture the CSS/wheel guards
  // can't intercept, e.g. iPadOS edge swipe) would leave the interview WITHOUT
  // the requireUnlockOnExit gate. Pin the history for the life of the route;
  // gated forward exits go through `exitToHome` so the pinned entry is consumed
  // rather than left buried (which would let Back from Home re-enter).
  const exitToHome = useHistoryBackGuard(true);
  const goHome = useCallback(
    () => exitToHome(() => navigate('/', { replace: true })),
    [exitToHome, navigate],
  );

  // Participant text-size choice, persisted per session in sessionStorage so
  // an idle-lock/unlock cycle — which unmounts and remounts this route —
  // restores it. A UI preference, not participant data, so it stays outside
  // the encrypted store; sessionStorage scopes it to the tab and clears when
  // the tab closes. Persistence is best-effort: storage access can throw
  // under strict privacy policies (cf. InstallBanner's guard), in which case
  // the Shell's in-memory selection still works — it just won't survive a
  // remount.
  const textScaleStorageKey = `interview-text-scale:${sessionId}`;
  const initialTextScale = useMemo(() => {
    try {
      const stored = sessionStorage.getItem(textScaleStorageKey);
      const parsed = stored === null ? Number.NaN : Number(stored);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [textScaleStorageKey]);
  const handleTextScaleChange = useCallback(
    (scale: number) => {
      try {
        sessionStorage.setItem(textScaleStorageKey, String(scale));
      } catch {
        // Best-effort persistence only.
      }
    },
    [textScaleStorageKey],
  );

  // Gated exit shared by the Shell exit button and the completion screen.
  const handleExit = useCallback(async () => {
    const settings = await getSettings();
    if (settings.requireUnlockOnExit) {
      const result = await requireFreshUnlock();
      if (!result.ok) return;
    }
    setAuthorizedInterviewId(null);
    goHome();
  }, [requireFreshUnlock, goHome, setAuthorizedInterviewId]);

  useEffect(() => {
    // Exit-fade window (see isLiveRoute above): do nothing at all — no gate,
    // no authorization write, no state update.
    if (!isLiveRoute) return undefined;
    let active = true;
    const load = async () => {
      const settings = await getSettings();
      // Skip the enter gate when this interview's entry was already authorized
      // in the current unlock session — i.e. an idle-lock/unlock cycle remounted
      // the same interview. The user just authenticated at the LockScreen, so a
      // second step-up prompt would be redundant.
      const alreadyAuthorized = getAuthorizedInterviewId() === sessionId;
      if (settings.requireUnlockOnEnter && !alreadyAuthorized) {
        const result = await requireFreshUnlock();
        if (!result.ok) {
          if (active) goHome();
          return;
        }
      }
      if (!active) return;
      const session = await getSession(sessionId);
      if (!session) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      // Bail if a sessionId change / unmount tore down this load while we
      // awaited — otherwise a stale load could write the shared authorization
      // ref and skip the enter gate for the wrong session on a later mount.
      if (!active) return;
      // Entry is now authorized for the rest of the unlock session, so a
      // subsequent lock/unlock remount of this interview won't re-prompt.
      setAuthorizedInterviewId(sessionId);
      const protocol = await getProtocolByHash(session.protocolHash);
      if (!protocol) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      // The launch-time sweep migrates stored protocols before routes render,
      // so a row still below the runtime's schema version is one that could
      // not be migrated. Refuse to run rather than hand the runtime a document
      // it cannot execute.
      if (protocol.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
        if (active) setState({ kind: 'incompatible' });
        return;
      }
      const assets = await buildResolvedAssets(session.protocolHash);
      const payload: InterviewPayload = {
        session: hydrateSession(session),
        protocol: {
          ...protocol.protocol,
          id: protocol.id,
          hash: protocol.hash,
          importedAt: protocol.importedAt,
          assets,
        },
      };
      if (!active) return;
      const readOnly = reviewRequested || session.finishedAt !== null;
      const lastAvailableStage = getLastAvailableAuthoredStageIndex(
        protocol.protocol.stages,
        session.network,
      );
      const hasNoAvailableAuthoredStage =
        lastAvailableStage === undefined && protocol.protocol.stages.length > 0;
      const shouldOverrideUnavailableStage =
        hasNoAvailableAuthoredStage &&
        (readOnly || session.resumeStageOverrideIndex === 0);
      const initialStep = shouldOverrideUnavailableStage
        ? 0
        : readOnly && session.currentStep >= protocol.protocol.stages.length
          ? (lastAvailableStage ?? 0)
          : session.currentStep;
      setCurrentStep(initialStep);
      currentStepRef.current = initialStep;
      setAllowStageNavigation(settings.allowStageNavigation);
      setState({
        kind: 'ready',
        payload,
        resolver: makeAssetResolver(session.protocolHash, protocol.importedAt),
        readOnly,
        initialStageOverrideIndex: shouldOverrideUnavailableStage
          ? 0
          : undefined,
      });
      if (!readOnly) {
        void updateSettings({
          lastActiveSessionId: session.id,
          lastActiveProtocolHash: session.protocolHash,
        });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    sessionId,
    goHome,
    requireFreshUnlock,
    getAuthorizedInterviewId,
    setAuthorizedInterviewId,
    reviewRequested,
    isLiveRoute,
  ]);

  const { client: posthogClient, enabled: analyticsEnabled } = useAnalytics();
  const readOnly = state.kind === 'ready' && state.readOnly;

  const analytics = useMemo(
    () => ({
      installationId: getInstallationId(),
      // No Electron/Capacitor host remains; this app is the only host.
      hostApp: POSTHOG_APP_KEY,
      appName: POSTHOG_APP_NAME,
      hostVersion: APP_VERSION,
    }),
    [],
  );

  // `finishedAt` is written solely by markSessionFinished (via handleFinish).
  // The engine never sets session.finishTime for an in-progress session, so a
  // sync landing after finish would otherwise rewrite it back to null and
  // un-finish the interview.
  //
  // Writes go to a local encrypted database and are never deferred — see
  // SYNC_BATCH_MS. The wrapper is here to collapse the bursts the engine emits
  // in one gesture, not to delay anything.
  const handleSync = useMemo<SyncHandler>(
    () =>
      createDebouncedSyncHandler(
        async (id, session) => {
          await updateSession(id, {
            network: session.network,
            currentStep: currentStepRef.current,
            stageMetadata: session.stageMetadata,
          });
        },
        { waitMs: SYNC_BATCH_MS },
      ),
    // Keyed by session: one handler batches for one interview. Sharing it
    // across two would let the second's snapshot replace the first's while
    // both sets of waiters are still attached, so the first would be reported
    // as synced by a write that discarded it. This route re-renders rather
    // than remounting when the id changes.
    [sessionId],
  );

  const handleFinish = useCallback(async (id: string) => {
    await markSessionFinished(id);
    setFinished(true);
  }, []);

  const handleStepChange = useCallback<StepChangeHandler>(
    (step, meta) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      if (readOnly) return;
      // Persist the participant-facing progress alongside the step so the
      // dashboard shows exactly what the participant saw, without re-deriving it
      // (and without needing to know about the engine's appended finish stage).
      void updateSession(sessionId, {
        currentStep: step,
        progress: meta.progress,
        resumeStageOverrideIndex: undefined,
      });
    },
    [readOnly, sessionId],
  );

  if (finished) {
    return <InterviewComplete onExit={() => void handleExit()} />;
  }

  if (state.kind === 'loading') {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.kind === 'incompatible') {
    return (
      <div className="mx-auto flex h-full max-w-lg items-center justify-center p-8">
        <Surface
          floating
          spacing="lg"
          shadow="lg"
          className="flex flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Interview unavailable</Heading>
          <Paragraph>
            The protocol this interview uses could not be updated to work with
            this version of the app, so this interview cannot be continued. Its
            responses remain available on the data screen. To start new
            interviews, repair the protocol in Architect and import it again.
          </Paragraph>
          <Button
            onClick={() => {
              setAuthorizedInterviewId(null);
              goHome();
            }}
          >
            Return home
          </Button>
        </Surface>
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <div className="mx-auto flex h-full max-w-lg items-center justify-center p-8">
        <Surface
          floating
          spacing="lg"
          shadow="lg"
          className="flex flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Interview not found</Heading>
          <Paragraph>
            This interview may have been deleted, or the protocol it used is no
            longer installed.
          </Paragraph>
          <Button
            onClick={() => {
              // Not gated (don't trap the user on an error screen), but clear
              // the entry authorization so a transient load failure can't leave
              // a stale id that would later skip the enter gate.
              setAuthorizedInterviewId(null);
              goHome();
            }}
          >
            Return home
          </Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <div
        aria-hidden
        className="bg-background pointer-events-none fixed inset-0 z-[-1]"
      />
      {readOnly && (
        <Alert
          variant="info"
          appearance="soft"
          density="compact"
          className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-1/2 z-50 m-0! w-[min(32rem,calc(100%-2rem))] -translate-x-1/2"
        >
          <AlertTitle>Read-only review</AlertTitle>
          <AlertDescription>
            Changes made while reviewing this interview will not be saved.
          </AlertDescription>
        </Alert>
      )}
      <Shell
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={readOnly ? discardSessionChanges : handleSync}
        onFinish={readOnly ? discardFinish : handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        posthogClient={posthogClient ?? undefined}
        disableAnalytics={readOnly || !analyticsEnabled}
        reviewMode={readOnly}
        initialStageOverrideIndex={state.initialStageOverrideIndex}
        finishConfirmationDescription="Finishing ends this interview. A researcher can mark it unfinished later if changes are needed."
        onExit={() => void handleExit()}
        allowStageNavigation={allowStageNavigation}
        allowUserScaling
        initialTextScale={initialTextScale}
        onTextScaleChange={handleTextScaleChange}
        navigationClassnames={NAVIGATION_SAFE_AREA_CLASSNAMES}
      />
    </div>
  );
}

function hydrateSession(stored: StoredSession): SessionPayload {
  return {
    id: stored.id,
    startTime: stored.startedAt,
    finishTime: stored.finishedAt,
    exportTime: stored.exportedAt,
    lastUpdated: stored.lastUpdatedAt,
    network: stored.network,
    promptIndex: 0,
    stageMetadata: stored.stageMetadata,
  };
}
