import {
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import {
  AppI18nProvider,
  AppMessage,
  useAppIntl,
  useLocaleCatalog,
} from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type CompletedAction,
  createDebouncedSyncHandler,
  type FinishHandler,
  type InterviewPayload,
  type SessionPayload,
  Shell,
  type StepChangeHandler,
  type SyncHandler,
  getLastAvailableAuthoredStageIndex,
  useContentLocale,
} from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  getLocaleMetadata,
  type LocalizationDeclaration,
} from '@codaco/protocol-validation';
import { Interviewer8Frame } from '~/components/Interviewer8Frame';
import { offlineMessages } from '~/components/offlineMessages';
import { interviewerLocales } from '~/i18n/locales';
import { browserLanguages } from '~/i18n/preference';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { POSTHOG_APP_KEY, POSTHOG_APP_NAME } from '~/lib/analytics/config';
import { APP_VERSION } from '~/lib/appVersion';
import {
  buildResolvedAssets,
  makeAssetResolver,
} from '~/lib/assets/assetResolver';
import { useAuth } from '~/lib/auth/AuthContext';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  getProtocolByHash,
  getSession,
  getSessionHeader,
  getSettings,
  markSessionFinished,
  updateSession,
  updateSettings,
} from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import { getInstallationId } from '~/lib/installationId';
import {
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
  legacyInterviewUrl,
} from '~/lib/legacyInterviewer';
import { refreshLegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';
import { useHistoryBackGuard } from '~/lib/pwa/useHistoryBackGuard';
import { interviewerCatalogSource } from '~/locales/catalogs';

const messages = defineMessages({
  // The id is older than this file: the message moved here from the
  // completion screen this host used to show, and kept its id so its
  // translations still apply.
  exit: {
    id: 'interviewer.interviewComplete.exit',
    defaultMessage: 'Exit',
    description:
      'Participant completion-screen action handing control back to the researcher, with authentication if required.',
  },
  finishConfirmationDescription: {
    id: 'interviewer.interview.finishConfirmationDescription',
    defaultMessage:
      'Finishing ends this interview. A researcher can mark it unfinished later if changes are needed.',
    description:
      'Participant confirmation explaining that finishing closes the interview now, while Interviewer allows a researcher to reopen it later.',
  },
  interviewUnavailable: {
    id: 'interviewer.interview.interviewUnavailable',
    defaultMessage: 'Interview unavailable',
    description: 'Visible copy in Interviewer Interview.',
  },
  theProtocolThisInterviewUsesCouldNot: {
    id: 'interviewer.interview.theProtocolThisInterviewUsesCouldNot',
    defaultMessage:
      'The protocol this interview uses could not be updated to work with this version of the app, so this interview cannot be continued. Its responses remain available on the data screen. To start new interviews, repair the protocol in Architect and import it again.',
    description: 'Visible copy in Interviewer Interview.',
  },
  thisInterviewUsesAnOlderSchema: {
    id: 'interviewer.interview.thisInterviewUsesAnOlderSchema',
    defaultMessage:
      'The protocol this interview uses is on an older version of the Network Canvas protocol schema, which this version of Interviewer cannot run, so this interview cannot be opened here. Its responses remain available on the data screen.',
    description:
      'Shown in place of an interview whose protocol uses an older protocol schema when this build of Interviewer does not include the previous version that runs such interviews. The responses can still be exported from the data screen.',
  },
  returnHome: {
    id: 'interviewer.interview.returnHome',
    defaultMessage: 'Return home',
    description: 'Visible copy in Interviewer Interview.',
  },
  interviewNotFound: {
    id: 'interviewer.interview.interviewNotFound',
    defaultMessage: 'Interview not found',
    description: 'Visible copy in Interviewer Interview.',
  },
  thisInterviewMayHaveBeenDeletedOr: {
    id: 'interviewer.interview.thisInterviewMayHaveBeenDeletedOr',
    defaultMessage:
      'This interview may have been deleted, or the protocol it used is no longer installed.',
    description: 'Visible copy in Interviewer Interview.',
  },
  interviewCouldNotBeOpened: {
    id: 'interviewer.interview.interviewCouldNotBeOpened',
    defaultMessage: 'Interview could not be opened',
    description:
      'Heading shown in place of an interview whose saved data could not be read, so the interview was not opened.',
  },
  theDataSavedForThisInterviewCouldNot: {
    id: 'interviewer.interview.theDataSavedForThisInterviewCouldNot',
    defaultMessage:
      'The data saved for this interview could not be read, so the interview has not been opened. The saved data has not been changed.',
    description:
      'Explains that an interview was not opened because its saved data could not be read, and reassures that the saved data was left unchanged.',
  },
  readOnlyReview: {
    id: 'interviewer.interview.readOnlyReview',
    defaultMessage: 'Read-only review',
    description: 'Visible copy in Interviewer Interview.',
  },
  changesMadeWhileReviewingThisInterviewWill: {
    id: 'interviewer.interview.changesMadeWhileReviewingThisInterviewWill',
    defaultMessage:
      'Changes made while reviewing this interview will not be saved.',
    description: 'Visible copy in Interviewer Interview.',
  },
});

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
//
// Zero is also load-bearing for the idle lock. `whenSessionWritesSettle` waits
// on the database queue, and an answer held here is not in that queue yet — it
// enters it on a zero-delay timer when the write in front lands, which the
// drain yields one macrotask to catch. Raise this and the drain stops covering
// the handler's buffer, and a lock can clear the key out from under a held
// answer. `lockDrainsWrites.test.tsx` fails if it is raised.
const SYNC_BATCH_MS = 0;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'incompatible' }
  | { kind: 'legacy-not-bundled' }
  // Interviewer 8's page could not be loaded into the frame (offline before
  // it was saved for offline use).
  | { kind: 'interviewer8-unreachable' }
  | { kind: 'unreadable' }
  | {
      // A schema 8 interview, run by the bundled Interviewer 8 in a frame.
      kind: 'hosted';
      sessionId: string;
      src: string;
      enterAuthorized: boolean;
    }
  | {
      // The hosted interview has ended, or its frame was lost: the frame is
      // gone and the route is on its way home (`lock`: locking as it goes).
      kind: 'leaving-hosted';
      lock: boolean;
    }
  | {
      kind: 'ready';
      sessionId: string;
      payload: InterviewPayload;
      resolver: (id: string) => Promise<string>;
      // An explicit review request: the Shell shows the stages, read-only.
      reviewMode: boolean;
      // Whether anything the interview does is saved. Not in a review, and not
      // for a session already finished when it loaded, which the Shell shows
      // in its completed state.
      writable: boolean;
      initialStageOverrideIndex?: number;
    };

// What this route writes for one interview: see `writeStates`.
type SessionWriteState = {
  synced: Pick<StoredSession, 'network' | 'stageMetadata'>;
  currentStep: number;
};

const loadFailureCopy = {
  'incompatible': {
    heading: messages.interviewUnavailable,
    body: messages.theProtocolThisInterviewUsesCouldNot,
  },
  'legacy-not-bundled': {
    heading: messages.interviewUnavailable,
    body: messages.thisInterviewUsesAnOlderSchema,
  },
  'interviewer8-unreachable': {
    heading: messages.interviewUnavailable,
    body: offlineMessages.notReadyHelp,
  },
  'missing': {
    heading: messages.interviewNotFound,
    body: messages.thisInterviewMayHaveBeenDeletedOr,
  },
  'unreadable': {
    heading: messages.interviewCouldNotBeOpened,
    body: messages.theDataSavedForThisInterviewCouldNot,
  },
};

const discardSessionChanges: SyncHandler = () => Promise.resolve();
const discardFinish: FinishHandler = () => Promise.resolve();

export function InterviewRoute({ sessionId }: { sessionId: string }) {
  const intl = useAppIntl();
  // Read once per mount: the interview matches these again each time it
  // loads, until the participant chooses a language.
  const [requestedLocales] = useState(browserLanguages);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  // This route re-renders rather than remounting when sessionId changes, so a
  // ready state can still belong to the previous interview while the next one
  // loads. Treat it as loading: leaving that Shell mounted would hand it
  // handlers bound to the new id, and its next step change would write the old
  // interview's progress into the new session.
  const state: LoadState =
    (loadState.kind === 'ready' || loadState.kind === 'hosted') &&
    loadState.sessionId !== sessionId
      ? { kind: 'loading' }
      : loadState;
  const hosting = state.kind === 'hosted' || state.kind === 'leaving-hosted';
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
  const [currentStep, setCurrentStep] = useState(0);
  const [allowStageNavigation, setAllowStageNavigation] = useState(false);
  // Every write from this route is the session's whole state — network, stage
  // metadata and resume position. The step change carries no
  // network of its own, so it writes the state most recently handed to
  // storage (`synced`): it is set as each sync write is queued, and writes to
  // one session land in the order they were queued, so a step change never
  // puts back an older network. The sync snapshot does not carry the current
  // step, so the step is kept here too.
  //
  // Kept per interview, not in one slot for whichever is showing. This route
  // re-renders rather than remounting when the id changes, and the previous
  // interview's sync handler can still write after the next one has loaded —
  // a write already queued, or the flush its Shell makes as it unmounts. With
  // one slot that write would be made against the next interview's protocol
  // and step, and would leave the previous interview's network for the next
  // interview's step change to write into it.
  //
  // One map for the life of the route, read and written only by the load,
  // sync and step handlers — nothing renders from it.
  const [writeStates] = useState(() => new Map<string, SessionWriteState>());

  // A history-back (browser button or a swipe gesture the CSS/wheel guards
  // can't intercept, e.g. iPadOS edge swipe) would leave the interview WITHOUT
  // the requireUnlockOnExit gate. Pin the history for the life of the route;
  // gated forward exits go through `exitToHome` so the pinned entry is consumed
  // rather than left buried (which would let Back from Home re-enter).
  //
  // While Interviewer 8 is hosted it pins the history itself, above this
  // route's pin, and nothing here may push an entry: the two share one joint
  // session history, and a push here would cut Interviewer 8's entries off.
  // So the pin stops re-pinning then; the entry it pushed when the route
  // mounted stays, and the exit below still consumes it.
  const { lock } = useAuth();
  const exitToHome = useHistoryBackGuard(!hosting);
  const goHome = useCallback(
    () => exitToHome(() => navigate('/', { replace: true })),
    [exitToHome, navigate],
  );

  // A schema 8 interview runs in the bundled Interviewer 8, hosted here in a
  // same-origin frame at `/v8/interview/<id>` with the same search
  // (`?mode=review` for review), so its participants see the interview they
  // always have. Both apps keep it in the one shared database. Nothing of it
  // is decrypted here.
  //
  // The way in is the one a schema 9 interview takes, so the researcher
  // unlocks once, here, and Interviewer 8 never shows its own lock screen on
  // the way in: this route's own enter step-up runs when requireUnlockOnEnter
  // is set. The frame is then handed this app's key (none on a device with no
  // lock, where both apps keep rows in plaintext) and told whether that step
  // was satisfied.
  //
  // An effect event, not a load-effect dependency: re-running the load would
  // re-host an interview already in progress.
  const hostInInterviewer8 = useEffectEvent(
    async (
      header: { protocolHash: string; finishedAt: string | null },
      isActive: () => boolean,
    ): Promise<boolean> => {
      const interviewer = getBundledLegacyInterviewer();
      if (!interviewer) return false;
      const settings = await getSettings();
      if (!isActive()) return true;
      const alreadyAuthorized = getAuthorizedInterviewId() === sessionId;
      if (settings.requireUnlockOnEnter && !alreadyAuthorized) {
        const result = await requireFreshUnlock();
        if (!result.ok) {
          if (isActive()) goHome();
          return true;
        }
      }
      if (!isActive()) return true;
      setAuthorizedInterviewId(sessionId);
      setLoadState({
        kind: 'hosted',
        sessionId,
        src: legacyInterviewUrl(
          interviewer,
          sessionId,
          search ? `?${search}` : '',
        ),
        enterAuthorized: settings.requireUnlockOnEnter,
      });
      // As for a schema 9 interview: Home focuses this protocol's card when
      // the interview ends. A review or a finished interview changes nothing.
      if (!reviewRequested && header.finishedAt === null) {
        void updateSettings({
          lastActiveSessionId: sessionId,
          lastActiveProtocolHash: header.protocolHash,
        });
      }
      return true;
    },
  );

  // Interviewer 8 ended its interview (its own exit gate has run inside the
  // frame), or the frame went away without saying so (a crash, a reload, a
  // navigation inside it), after which this app cannot vouch for what the
  // device was doing and locks. The frame is taken away first; the effect
  // below then leaves as a schema 9 interview's exit does. Home loads its
  // deck, resume pill and data view afresh when it mounts.
  const handleHostedClosed = useCallback(() => {
    setLoadState({ kind: 'leaving-hosted', lock: false });
  }, []);
  const handleHostedLost = useCallback(() => {
    setLoadState({ kind: 'leaving-hosted', lock: true });
  }, []);
  const handleHostedUnavailable = useCallback(() => {
    setLoadState({ kind: 'interviewer8-unreachable' });
  }, []);
  const leavingHosted = state.kind === 'leaving-hosted' ? state : null;
  useEffect(() => {
    if (!leavingHosted) return;
    setAuthorizedInterviewId(null);
    // Entries the departed frame pushed (Interviewer 8 pins its own, and a
    // frame that crashed or navigated away never popped it) may lie above
    // this route's pin. Stepping back over them fires nothing here, so the
    // unwinding steps over them until it reaches this window's own entry, and
    // only that entry is replaced with Home: Back from Home cannot re-enter.
    exitToHome(() => navigate('/', { replace: true }), {
      stepOverFrameEntries: true,
    });
    if (leavingHosted.lock) void lock();
    // Interviewer 8 may have installed its worker while it ran.
    void refreshLegacyInterviewerOffline();
  }, [leavingHosted, exitToHome, lock, navigate, setAuthorizedInterviewId]);

  // The route stopped being this interview while the frame was still up, by
  // neither 'closed' nor a lost frame: the history went back past it (under
  // Interviewer 8's error screen, say, its own pin is gone, and this route's
  // pin does not re-pin while hosting). That is a way out without the exit
  // step, so it locks, as a lost frame does.
  const hostedSessionId =
    loadState.kind === 'hosted' ? loadState.sessionId : null;
  useEffect(() => {
    if (hostedSessionId === null) return;
    if (isLiveRoute && hostedSessionId === sessionId) return;
    void lock();
  }, [hostedSessionId, isLiveRoute, sessionId, lock]);

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

  const {
    client: posthogClient,
    enabled: analyticsEnabled,
    captureException,
  } = useAnalytics();
  // An effect event, not a load-effect dependency: re-running the load would
  // re-hydrate an interview already in progress.
  const reportLoadFailure = useEffectEvent((cause: unknown) => {
    captureException(cause, { feature: 'interview-load' });
  });

  // Gated exit shared by the Shell exit button and the completed state's Exit.
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
      // Schema detection first, from the plaintext columns alone: nothing of a
      // schema 8 interview is unlocked or decrypted by this app.
      const header = await getSessionHeader(sessionId);
      if (!active) return;
      const schemaVersion = header?.schemaVersion;
      if (
        header &&
        schemaVersion !== undefined &&
        schemaVersion < COMPATIBLE_PROTOCOL_SCHEMA_VERSION
      ) {
        // Only schema 8 has an Interviewer to run it; anything older (none
        // should exist) is explained, as is a build without Interviewer 8.
        const hosted =
          schemaVersion === LEGACY_INTERVIEWER_MAJOR &&
          (await hostInInterviewer8(header, () => active));
        if (!hosted && active) setLoadState({ kind: 'legacy-not-bundled' });
        return;
      }
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
        if (active) setLoadState({ kind: 'missing' });
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
        if (active) setLoadState({ kind: 'missing' });
        return;
      }
      // Nothing here migrates a stored protocol: one at another schema
      // version cannot run. Refuse rather than hand the runtime a document it
      // cannot execute or a session it cannot read.
      if (protocol.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
        if (active) setLoadState({ kind: 'incompatible' });
        return;
      }
      const assets = await buildResolvedAssets(session.protocolHash);
      const payload: InterviewPayload = {
        session: hydrateSession(session, protocol.protocol.localization),
        protocol: {
          ...protocol.protocol,
          id: protocol.id,
          hash: protocol.hash,
          importedAt: protocol.importedAt,
          assets,
        },
      };
      if (!active) return;
      const writable = !reviewRequested && session.finishedAt === null;
      const readOnly = !writable;
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
      writeStates.set(sessionId, {
        synced: {
          network: session.network,
          stageMetadata: session.stageMetadata,
        },
        currentStep: initialStep,
      });
      setAllowStageNavigation(settings.allowStageNavigation);
      setLoadState({
        kind: 'ready',
        sessionId,
        payload,
        resolver: makeAssetResolver(session.protocolHash, protocol.importedAt),
        reviewMode: reviewRequested,
        writable,
        initialStageOverrideIndex: shouldOverrideUnavailableStage
          ? 0
          : undefined,
      });
      if (writable) {
        void updateSettings({
          lastActiveSessionId: session.id,
          lastActiveProtocolHash: session.protocolHash,
        });
      }
    };
    // Fail closed: a session whose stored data cannot be read must never be
    // replaced by one the Shell builds without it, so refuse to mount the
    // Shell (and with it every autosave) and report the failure.
    load().catch((cause: unknown) => {
      if (!active) return;
      setLoadState({ kind: 'unreadable' });
      reportLoadFailure(cause);
    });
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
    writeStates,
  ]);

  const reviewMode = state.kind === 'ready' && state.reviewMode;
  const readOnly = state.kind === 'ready' && !state.writable;

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
  const handleSync = useMemo<SyncHandler>(() => {
    // One handler batches for one interview: it holds a single pending
    // snapshot, so a handler reused across two would let the second replace the
    // first while both sets of waiters were attached, resolving the first's
    // promise with a write that discarded its state. This route re-renders
    // rather than remounting when the id changes, so the handler is rebuilt for
    // each session and refuses anything else outright.
    const ownerId = sessionId;
    return createDebouncedSyncHandler(
      async (id, session) => {
        if (id !== ownerId) {
          throw new Error(
            `Sync for interview ${id} reached the handler for ${ownerId}`,
          );
        }
        const writeState = writeStates.get(id);
        if (!writeState) {
          throw new Error(`Sync for interview ${id} arrived before it loaded`);
        }
        writeState.synced = {
          network: session.network,
          stageMetadata: session.stageMetadata,
        };
        await updateSession(id, {
          network: session.network,
          currentStep: writeState.currentStep,
          stageMetadata: session.stageMetadata,
        });
      },
      { waitMs: SYNC_BATCH_MS },
    );
  }, [sessionId, writeStates]);

  // Once this resolves the Shell shows its completed state in place; the
  // route stays where it is. The finish confirmation cannot be dismissed while
  // this runs, so the signal aborts only when the interview is torn down, and
  // then nothing is written: a stored finish must always be one the Shell went
  // on to show as completed. The write itself checks the signal again before
  // it commits, so a teardown while it waits or encrypts still writes nothing.
  const handleFinish = useCallback<FinishHandler>(
    async (id, finish, signal) => {
      signal.throwIfAborted();
      await markSessionFinished(id, finish, signal);
    },
    [],
  );

  // The one action on a finished interview's completed state: hand the device
  // back through the same gated exit as the Shell's own exit button.
  const completedActions = useMemo<readonly CompletedAction[]>(
    () => [
      {
        label: <InterviewLanguageMessage message={messages.exit} />,
        onAction: () => void handleExit(),
      },
    ],
    [handleExit],
  );

  const handleStepChange = useCallback<StepChangeHandler>(
    (step, meta) => {
      setCurrentStep(step);
      const writeState = writeStates.get(sessionId);
      if (!writeState) return;
      writeState.currentStep = step;
      if (readOnly) return;
      // Persist the participant-facing progress alongside the step so the
      // dashboard shows exactly what the participant saw, without re-deriving it.
      void updateSession(sessionId, {
        ...writeState.synced,
        currentStep: step,
        progress: meta.progress,
        resumeStageOverrideIndex: undefined,
      });
    },
    [readOnly, sessionId, writeStates],
  );

  if (state.kind === 'hosted') {
    return (
      <Interviewer8Frame
        // One frame per interview: a new address is a new frame.
        key={state.src}
        src={state.src}
        enterAuthorized={state.enterAuthorized}
        onClosed={handleHostedClosed}
        onLost={handleHostedLost}
        onUnavailable={handleHostedUnavailable}
      />
    );
  }

  if (state.kind === 'leaving-hosted') {
    return <div className="bg-background h-full" />;
  }

  if (state.kind === 'loading') {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (
    state.kind === 'incompatible' ||
    state.kind === 'legacy-not-bundled' ||
    state.kind === 'interviewer8-unreachable' ||
    state.kind === 'missing' ||
    state.kind === 'unreadable'
  ) {
    const copy = loadFailureCopy[state.kind];
    return (
      <LoadFailure
        heading={intl.formatMessage(copy.heading)}
        body={intl.formatMessage(copy.body, {
          version: LEGACY_INTERVIEWER_MAJOR,
        })}
        onReturnHome={() => {
          // Not gated (don't trap the user on an error screen), but clear the
          // entry authorization so a transient load failure can't leave a
          // stale id that would later skip the enter gate.
          setAuthorizedInterviewId(null);
          goHome();
        }}
      />
    );
  }

  return (
    <div className="flex h-full w-full">
      <div
        aria-hidden
        className="bg-background pointer-events-none fixed inset-0 z-[-1]"
      />
      {reviewMode && (
        <Alert
          variant="info"
          appearance="soft"
          density="compact"
          className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-1/2 z-50 m-0! w-[min(32rem,calc(100%-2rem))] -translate-x-1/2"
        >
          <AlertTitle>{intl.formatMessage(messages.readOnlyReview)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(
              messages.changesMadeWhileReviewingThisInterviewWill,
            )}
          </AlertDescription>
        </Alert>
      )}
      <Shell
        requestedLocales={requestedLocales}
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={readOnly ? discardSessionChanges : handleSync}
        onFinish={readOnly ? discardFinish : handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        posthogClient={posthogClient ?? undefined}
        // Without a client the Shell would start its own posthog-js instance
        // from the default entrypoint, so analytics stay off until ours has
        // resolved (it lags the opt-in state at unlock and on a later opt-in,
        // and is null for good when disabled at build time or failed to load).
        disableAnalytics={readOnly || !analyticsEnabled || !posthogClient}
        reviewMode={reviewMode}
        completedActions={reviewMode ? undefined : completedActions}
        initialStageOverrideIndex={state.initialStageOverrideIndex}
        finishConfirmationDescription={
          <InterviewLanguageMessage
            message={messages.finishConfirmationDescription}
          />
        }
        onExit={() => void handleExit()}
        allowStageNavigation={allowStageNavigation}
        allowUserScaling
        initialTextScale={initialTextScale}
        onTextScaleChange={handleTextScaleChange}
        navigationClassnames={NAVIGATION_SAFE_AREA_CLASSNAMES}
        // Redux DevTools and the action logger connect only in a development
        // build.
        flags={{ isDevelopment: import.meta.env.DEV }}
      />
    </div>
  );
}

function LoadFailure({
  heading,
  body,
  onReturnHome,
}: {
  heading: string;
  body: string;
  onReturnHome: () => void;
}) {
  const intl = useAppIntl();
  return (
    <div className="mx-auto flex h-full max-w-lg items-center justify-center p-8">
      <Surface
        floating
        spacing="lg"
        shadow="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">{heading}</Heading>
        <Paragraph>{body}</Paragraph>
        <Button onClick={onReturnHome}>
          {intl.formatMessage(messages.returnHome)}
        </Button>
      </Surface>
    </div>
  );
}

// Host messages that render inside the Shell (the finish dialog's explanation,
// the completed state's Exit) take the language the interview shows, which it
// negotiates from the protocol's languages; the interview never uses
// Interviewer's own language. Interviewer's catalog for that language loads
// here when it is not Interviewer's own; the boundary keeps a late catalog
// from suspending the whole interview behind the Shell's loading screen.
function InterviewLanguageMessage({ message }: { message: MessageDescriptor }) {
  return (
    <Suspense fallback={null}>
      <InterviewLanguageMessageText message={message} />
    </Suspense>
  );
}

function InterviewLanguageMessageText({
  message,
}: {
  message: MessageDescriptor;
}) {
  const locale = useContentLocale();
  const catalog = useLocaleCatalog(interviewerCatalogSource, locale);
  const direction =
    interviewerLocales.find((entry) => entry.locale === catalog.locale)
      ?.direction ?? 'ltr';
  return (
    <AppI18nProvider
      locale={catalog.locale}
      locales={interviewerLocales}
      messages={catalog.messages}
      manageDocument={false}
    >
      <span lang={catalog.locale} dir={direction}>
        <AppMessage message={message} />
      </span>
    </AppI18nProvider>
  );
}

function hydrateSession(
  stored: StoredSession,
  localization: LocalizationDeclaration,
): SessionPayload {
  return {
    id: stored.id,
    startTime: stored.startedAt,
    finishTime: stored.finishedAt,
    // Null for a session finished before finish stages were recorded; the
    // Shell then shows the protocol's last finish stage.
    finishStageId: stored.finishStageId ?? null,
    exportTime: stored.exportedAt,
    lastUpdated: stored.lastUpdatedAt,
    network: stored.network,
    promptIndex: 0,
    stageMetadata: stored.stageMetadata,
    localeOptions: localization.locales.map((locale) =>
      getLocaleMetadata(locale),
    ),
  };
}
