'use client';
'use no memo';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import type { Store } from '@reduxjs/toolkit';
import { AnimatePresence, motion } from 'motion/react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Provider, useSelector } from 'react-redux';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import {
  type AnalyticsClient,
  NULL_TRACKER,
  type Tracker,
} from './analytics/tracker';
import { useStageNavigationAnalytics } from './analytics/useStageNavigationAnalytics';
import { GeospatialOfflineIndicator } from './components/GeospatialOfflineIndicator';
import Navigation, { TEXT_SCALE_OPTIONS } from './components/Navigation';
import StageErrorBoundary from './components/StageErrorBoundary';
import { CurrentStepProvider } from './contexts/CurrentStepContext';
import {
  type InterviewCompletion,
  InterviewCompletionProvider,
  useInterviewCompletion,
} from './contexts/InterviewCompletionContext';
import { StageMetadataProvider } from './contexts/StageMetadataContext';
import { ContractProvider } from './contract/context';
import type {
  AssetRequestHandler,
  CompletedAction,
  FinishHandler,
  InterviewAnalyticsMetadata,
  InterviewerFlags,
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  StepChangeHandler,
  SyncHandler,
} from './contract/types';
import useInterviewNavigation from './hooks/useInterviewNavigation';
import useMediaQuery from './hooks/useMediaQuery';
import { InterviewI18nProvider } from './i18n/InterviewI18nProvider';
import { CompletedInterview } from './interfaces/FinishSession/FinishSession';
import {
  ProtocolLocalizationProvider,
  useProtocolLocale,
} from './localization/ProtocolLocalizationProvider';
import { getLocalePreference, getRecordedLocale } from './selectors/session';
import { getLastAvailableAuthoredStageIndex } from './selectors/skip-logic';
import { getProtocolLocalization, getStages } from './store/modules/protocol';
import { recordLocale, setLocalePreference } from './store/modules/session';
import { store, useAppDispatch, type RootState } from './store/store';
import { SyncFlushProvider } from './store/SyncFlushContext';
import { WritesInFlightProvider } from './store/WritesInFlightContext';
import {
  InterviewToastProvider,
  InterviewToastViewport,
} from './toast/InterviewToast';

// `interface` is required (not `type`) so this declaration MERGES with the
// global Window from lib.dom.d.ts instead of replacing it. Exposes the live
// Redux store to Playwright e2e tests (see the effect below).
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging with the global Window requires `interface`, not `type`
  interface Window {
    __interviewStore?: Store<RootState>;
  }
}

const variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Orientation of the interview Navigation. `horizontal` renders the nav as a
 * bar along the bottom (with the stage above it); `vertical` renders it as a
 * rail down the side (with the stage beside it).
 */
export type NavigationOrientation = 'horizontal' | 'vertical';

type NavigationClassnames = {
  [Orientation in NavigationOrientation]?: string;
};

/**
 * Snap an arbitrary multiplier to the nearest selectable option so a
 * host-restored value always matches a menu radio item (and stray values
 * can't push the scale outside the supported range).
 */
function snapTextScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) return 1;
  return TEXT_SCALE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - scale) < Math.abs(closest - scale) ? option : closest,
  );
}

type InterviewProps = {
  onExit?: () => void;
  hideNavigation?: boolean;
  navigationOrientation?: NavigationOrientation;
  navigationClassnames?: NavigationClassnames;
  allowStageNavigation?: boolean;
  allowUserScaling?: boolean;
  initialTextScale?: number;
  onTextScaleChange?: (scale: number) => void;
  initialStageOverrideIndex?: number;
  reviewMode?: boolean;
};

type TextScaleStyle = CSSProperties & { '--interview-text-scale': number };

/**
 * A finished interview shows its completed state; a review of one shows its
 * stages, because reading them is what a review is for. A review of a
 * protocol with no stage before its finish stage has nothing to show, so it
 * shows the finish stage's text, read-only, without the Finish button.
 *
 * The participant's text size is held here, above both, so it carries from
 * the interview into its completed state.
 */
function Interview(props: InterviewProps) {
  const { initialTextScale, onTextScaleChange } = props;
  const { completion } = useInterviewCompletion();
  const stages = useSelector(getStages);
  const [textScale, setTextScale] = useState(() =>
    snapTextScale(initialTextScale),
  );
  const handleTextScaleChange = useCallback(
    (scale: number) => {
      setTextScale(scale);
      onTextScaleChange?.(scale);
    },
    [onTextScaleChange],
  );
  const textScaleStyle: TextScaleStyle = {
    '--interview-text-scale': textScale,
  };

  if (props.reviewMode === true) {
    const hasReviewableStage =
      stages.length > 0 && stages[0]?.type !== 'FinishSession';
    if (!hasReviewableStage) {
      return (
        <CompletedShell
          stageId={undefined}
          focusOnMount={false}
          notice={false}
          textScaleStyle={textScaleStyle}
        />
      );
    }
  } else if (completion) {
    return (
      <CompletedShell
        stageId={completion.stageId}
        focusOnMount={completion.finishedHere}
        notice
        textScaleStyle={textScaleStyle}
      />
    );
  }
  return (
    <ActiveInterview
      {...props}
      textScale={textScale}
      onTextScaleChange={handleTextScaleChange}
    />
  );
}

/**
 * A finished interview, opened again or just finished: the finish stage it
 * ended at, in its completed state. There is no navigation, so there is no
 * way back into the interview.
 */
function CompletedShell({
  stageId,
  focusOnMount,
  notice,
  textScaleStyle,
}: {
  stageId: string | null | undefined;
  focusOnMount: boolean;
  notice: boolean;
  textScaleStyle: TextScaleStyle;
}) {
  const { metadata: interviewLocale } = useProtocolLocale();
  const stages = useSelector(getStages);
  const finishStages = stages.filter(
    (candidate) => candidate.type === 'FinishSession',
  );
  // The stage the host recorded, or, for an interview finished before finish
  // stages were recorded, the last one: where a linear interview ends.
  const stage =
    finishStages.find((candidate) => candidate.id === stageId) ??
    finishStages.at(-1);

  return (
    <ThemedRegion
      theme="interview"
      lang={interviewLocale.locale}
      dir={interviewLocale.direction}
      render={
        <main
          style={textScaleStyle}
          className="shell-type-ramp relative flex size-full flex-1 overflow-hidden"
        />
      }
    >
      <DirectionProvider direction={interviewLocale.direction}>
        <div
          className="relative flex size-full flex-col items-center justify-center pt-[env(safe-area-inset-top)]"
          id="stage"
          data-interview-completed=""
        >
          <CompletedInterview
            stage={stage}
            focusOnMount={focusOnMount}
            notice={notice}
          />
        </div>
      </DirectionProvider>
    </ThemedRegion>
  );
}

function ActiveInterview({
  onExit,
  hideNavigation = false,
  navigationOrientation: orientationProp,
  navigationClassnames,
  allowStageNavigation,
  allowUserScaling,
  textScale,
  onTextScaleChange,
  initialStageOverrideIndex,
  reviewMode,
}: InterviewProps & {
  textScale: number;
  onTextScaleChange: (scale: number) => void;
}) {
  const { metadata: interviewLocale } = useProtocolLocale();
  const {
    stage,
    displayedStep,
    showStage,
    canRenderStage,
    CurrentInterface,
    registerBeforeNext,
    getNavigationHelpers,
    handleExitComplete,
    moveForward,
    moveBackward,
    goToStage,
    disableMoveForward,
    disableMoveBackward,
    pulseNext,
    progress,
  } = useInterviewNavigation(initialStageOverrideIndex, reviewMode);

  useStageNavigationAnalytics({
    stage_index: displayedStep,
    stage_type: stage?.type,
    enabled: canRenderStage,
  });

  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [toastManager] = useState(() => Toast.createToastManager());

  // When the host doesn't force an orientation, derive it from the viewport
  // aspect ratio: tall viewports get a horizontal (bottom) nav bar, wide ones
  // get a vertical (side) rail.
  //
  // The threshold is intentionally generous (5/4 rather than the square 1/1, or
  // the previous 3/4) so a software keyboard opening on a portrait tablet — which
  // shrinks the viewport height and can push the aspect ratio just past square —
  // doesn't flip the nav from bottom to side mid-interview. Hosts with a known
  // device context can pass `navigationOrientation` to bypass this detection.
  const prefersHorizontalNav = useMediaQuery('(max-aspect-ratio: 5/4)');
  const navigationOrientation: NavigationOrientation =
    orientationProp ?? (prefersHorizontalNav ? 'horizontal' : 'vertical');
  const isHorizontalNav = navigationOrientation === 'horizontal';

  // The participant-chosen multiplier, applied on top of the viewport ramp
  // below, is owned by `Interview` so it survives stage navigation and carries
  // into the completed state; hosts opt in via `allowUserScaling` and may
  // persist it across remounts (e.g. the Interviewer's lock screen) with
  // `initialTextScale`/`onTextScaleChange`.
  const textScaleStyle: TextScaleStyle = {
    '--interview-text-scale': textScale,
  };

  // The interview's language boundary. Everything the Shell renders (stage,
  // navigation, dialogs and toasts alike) takes the interview language and
  // lays out in its direction from here; no text inside marks its own, apart
  // from the Language Chooser's language names, each written in itself.
  return (
    <ThemedRegion
      theme="interview"
      lang={interviewLocale.locale}
      dir={interviewLocale.direction}
      render={
        <main
          style={textScaleStyle}
          className={cx(
            'relative flex size-full flex-1 overflow-hidden',
            // Fluid viewport ramp for the --theme-root-size type-scale
            // sentinel, scoped to the Shell so only the full-screen interview
            // scales (not other themed regions). Defined in interview.css:
            // phones hold a dense 0.9rem-floored curve (including landscape,
            // via its height/width media condition), tablets hold the full
            // 1rem base, large displays ramp to a 1.25rem cap. Spacing and
            // node sizes ramp with it via interview.css's --spacing-base
            // redeclaration. The ramp multiplies by the participant's
            // text-size preference (--interview-text-scale, set via the style
            // prop above), so one factor scales type, spacing, and touch
            // targets coherently.
            'shell-type-ramp',
            isHorizontalNav ? 'flex-col' : 'flex-row-reverse',
          )}
        />
      }
    >
      <DirectionProvider direction={interviewLocale.direction}>
        <DialogProvider>
          <DndStoreProvider>
            <StageMetadataProvider value={registerBeforeNext}>
              <InterviewToastProvider
                toastManager={toastManager}
                forwardButtonRef={forwardButtonRef}
                backButtonRef={backButtonRef}
                orientation={navigationOrientation}
              >
                <AnimatePresence
                  mode="wait"
                  onExitComplete={handleExitComplete}
                >
                  {showStage && stage && (
                    <motion.div
                      key={displayedStep}
                      data-stage-step={displayedStep}
                      // pt insets the stage below the device's top safe area
                      // (status bar/notch) so stage content never slides under
                      // it in an installed PWA; env() is 0 everywhere else. The
                      // navigation owns its own inset (via navigationClassnames)
                      // so its background can still meet the screen edge.
                      className="flex min-h-0 min-w-0 flex-1 pt-[env(safe-area-inset-top)]"
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.5 }}
                    >
                      <div
                        className="relative flex size-full flex-col items-center justify-center"
                        id="stage"
                        key={stage.id}
                      >
                        {canRenderStage && (
                          <GeospatialOfflineIndicator
                            active={stage.type === 'Geospatial'}
                          />
                        )}
                        <StageErrorBoundary>
                          {canRenderStage && CurrentInterface && (
                            <CurrentInterface
                              key={stage.id}
                              stage={stage}
                              getNavigationHelpers={getNavigationHelpers}
                            />
                          )}
                        </StageErrorBoundary>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </InterviewToastProvider>
            </StageMetadataProvider>
            {!hideNavigation && (
              <Navigation
                moveBackward={moveBackward}
                moveForward={moveForward}
                goToStage={goToStage}
                allowStageNavigation={allowStageNavigation}
                disableMoveForward={disableMoveForward}
                disableMoveBackward={disableMoveBackward}
                pulseNext={pulseNext}
                progress={progress}
                orientation={navigationOrientation}
                className={navigationClassnames?.[navigationOrientation]}
                forwardButtonRef={forwardButtonRef}
                backButtonRef={backButtonRef}
                onExit={onExit}
                reviewMode={reviewMode}
                allowUserScaling={allowUserScaling}
                textScale={textScale}
                onTextScaleChange={onTextScaleChange}
              />
            )}
            {/*
             * A stable manager belongs to this Shell alone. The
             * viewport's portal lands inside ThemedRegion (themed
             * surface + portal-container context) regardless of what the
             * host sets up. Hosts may still mount their own app-level
             * Toast.Provider for non-interview toasts; the two are
             * independent channels, as are other Shells on the same page.
             */}
            <Toast.Provider toastManager={toastManager}>
              <InterviewToastViewport />
            </Toast.Provider>
          </DndStoreProvider>
        </DialogProvider>
      </DirectionProvider>
    </ThemedRegion>
  );
}

/**
 * Connects both languages to the session: the interface language follows the
 * participant's stated preference when it has that language, and the protocol
 * translation is chosen, recorded, and changed through the session store.
 */
function InterviewLocalization({
  requestedLocales,
  localeOptions,
  children,
}: {
  requestedLocales: readonly string[];
  localeOptions: InterviewPayload['session']['localeOptions'];
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const localization = useSelector(getProtocolLocalization);
  const localePreference = useSelector(getLocalePreference);
  const recordedLocale = useSelector(getRecordedLocale);

  const handleLocalePreferenceChange = useCallback(
    (locale: string) => dispatch(setLocalePreference(locale)),
    [dispatch],
  );
  const handleLocaleRecorded = useCallback(
    (locale: string) => dispatch(recordLocale(locale)),
    [dispatch],
  );

  return (
    <InterviewI18nProvider
      requestedLocale={requestedLocales}
      localePreference={localePreference}
    >
      <ProtocolLocalizationProvider
        localization={localization}
        localeOptions={localeOptions}
        requestedLocales={requestedLocales}
        localePreference={localePreference}
        recordedLocale={recordedLocale}
        onLocalePreferenceChange={handleLocalePreferenceChange}
        onLocaleRecorded={handleLocaleRecorded}
      >
        {children}
      </ProtocolLocalizationProvider>
    </InterviewI18nProvider>
  );
}

/**
 * `currentStep` and `onStepChange` together implement the controlled-component
 * pattern for the rendered stage index. Provide both to drive the step from
 * the host (e.g. to persist it in the URL or session storage); omit both to
 * let the package own step state internally. Mixing the two (providing only
 * one) is unsupported.
 */
type ShellProps = {
  /**
   * The browser's languages, most preferred first: `navigator.languages` in a
   * browser host, the parsed `Accept-Language` header in a server-rendered one
   * (serialised to the client so both choose alike). Until the participant
   * states a preference, these choose both the protocol translation and the
   * language of the interview's built-in text. The package reads no browser
   * or storage globals itself.
   */
  requestedLocales: readonly string[];
  payload: InterviewPayload;
  onSync: SyncHandler;
  /**
   * Persists the session's `locale` and `localePreference`, which the general
   * `onSync` route never writes.
   */
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
  onFinish: FinishHandler;
  onRequestAsset: AssetRequestHandler;
  currentStep?: number;
  onStepChange?: StepChangeHandler;
  flags?: InterviewerFlags;
  analytics: InterviewAnalyticsMetadata;
  posthogClient?: AnalyticsClient;
  disableAnalytics?: boolean;
  /**
   * Host-specific explanation shown in the finish confirmation dialog.
   */
  finishConfirmationDescription?: ReactNode;
  onExit?: () => void;
  /**
   * The actions offered on the completed state of a finished interview, such
   * as Interviewer's "Exit", in order; the first is the primary one. The
   * completed state is shown when the payload's session is finished, and as
   * soon as the participant finishes.
   */
  completedActions?: readonly CompletedAction[];
  /**
   * Adapt the Shell for reviewing an existing interview: show its stages even
   * when it is finished, stop before its finish stage, use review-specific
   * exit messaging, and suppress interview analytics. The host remains responsible for supplying non-persisting sync
   * and finish handlers.
   */
  reviewMode?: boolean;
  /**
   * Render the interview without the Navigation rail/bar so the stage fills
   * the viewport. Used by screenshot-capture stories; not intended for
   * production interviews.
   */
  hideNavigation?: boolean;
  /**
   * Force the Navigation orientation (`horizontal` = bottom bar, `vertical` =
   * side rail) instead of deriving it from the viewport aspect ratio. Useful
   * on devices where the viewport resizes dynamically — e.g. a portrait tablet
   * whose software keyboard would otherwise flip the nav mid-interview. When
   * omitted, the orientation responds to the aspect ratio automatically.
   */
  navigationOrientation?: NavigationOrientation;
  navigationClassnames?: NavigationClassnames;
  allowStageNavigation?: boolean;
  /**
   * Let the participant adjust the interview's text size from a settings menu
   * in the Navigation. The chosen size multiplies the whole interview scale
   * (type, spacing, and touch targets together) and lasts for the current
   * session. A settings menu is shown when scaling or exiting is available.
   */
  allowUserScaling?: boolean;
  /**
   * Starting value for the participant text-size multiplier (snapped to the
   * nearest selectable option). Pair with `onTextScaleChange` to persist the
   * choice across Shell remounts — e.g. the Interviewer restores it after its
   * lock screen unmounts and remounts the interview.
   */
  initialTextScale?: number;
  /**
   * Called with the new multiplier whenever the participant changes the text
   * size.
   */
  onTextScaleChange?: (scale: number) => void;
  /**
   * Allow this unavailable stage to render on the initial visit only. The
   * override is cleared as soon as stage navigation occurs. Architect preview
   * uses this to show the stage being edited without removing its skip logic.
   */
  initialStageOverrideIndex?: number;
};

const Shell = ({
  requestedLocales,
  payload,
  onSync,
  onProtocolLocaleChange,
  onFinish,
  onRequestAsset,
  currentStep,
  onStepChange,
  flags,
  analytics,
  posthogClient,
  disableAnalytics = false,
  finishConfirmationDescription,
  onExit,
  completedActions,
  reviewMode,
  hideNavigation,
  navigationOrientation,
  navigationClassnames,
  allowStageNavigation,
  allowUserScaling,
  initialTextScale,
  onTextScaleChange,
  initialStageOverrideIndex,
}: ShellProps) => {
  // Anchor onSync in a ref so the store factory receives a stable callback
  // (the sync middleware closes over it once at store creation). Hosts
  // commonly pass an inline arrow, which would otherwise force the store to
  // be recreated on every host re-render.
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const stableOnSync = useCallback<SyncHandler>(
    (...args) => onSyncRef.current(...args),
    [],
  );
  const onProtocolLocaleChangeRef = useRef(onProtocolLocaleChange);
  onProtocolLocaleChangeRef.current = onProtocolLocaleChange;
  const stableOnProtocolLocaleChange = useCallback<ProtocolLocaleChangeHandler>(
    (...args) => onProtocolLocaleChangeRef.current(...args),
    [],
  );

  // Tracker holder. The AnalyticsProvider mounts asynchronously (dynamic
  // import of posthog-js) so we cannot pass the tracker directly into the
  // store factory. Instead we hand the listener middleware a stable forwarder
  // that delegates to whatever tracker is currently resolved. The middleware
  // keeps a static reference; AnalyticsProvider mutates trackerRef as the
  // resolution completes.
  const trackerRef = useRef<Tracker>(NULL_TRACKER);
  const trackerHolder: Tracker = useMemo(
    () => ({
      track: (e, p) => trackerRef.current.track(e, p),
      captureException: (err, p) => trackerRef.current.captureException(err, p),
    }),
    [],
  );

  const reduxStore = useMemo(
    () =>
      store(payload, {
        onSync: stableOnSync,
        onProtocolLocaleChange: stableOnProtocolLocaleChange,
        isDevelopment: flags?.isDevelopment,
        tracker: trackerHolder,
      }),
    [
      payload,
      stableOnSync,
      stableOnProtocolLocaleChange,
      flags?.isDevelopment,
      trackerHolder,
    ],
  );

  // A host that batches writes (see createDebouncedSyncHandler) may be holding
  // recent answers when the document goes away, and a hidden document is not
  // promised any more script at all — mobile browsers suspend a backgrounded
  // tab, and a suspended timer does not fire. Write now, while there is still a
  // page to write from. This is the moment that matters most for an installed
  // PWA: the device is put to sleep seconds after an answer, and whatever was
  // being held would otherwise wait on a timer that only resumes minutes later,
  // into a host that may by then have torn down what the write needed.
  //
  // pagehide covers the navigation/bfcache case the visibility change misses.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') {
        void reduxStore.flushSync({ unloading: true });
      }
    };
    const flushNow = () => void reduxStore.flushSync({ unloading: true });
    document.addEventListener('visibilitychange', flushIfHidden);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [reduxStore]);

  // Teardown backstop. The host has navigated away — an interview exit, a lock
  // screen — so anything a batching host is still holding has to go now, before
  // whatever reads the stored session next: a prompt resume would otherwise
  // hydrate the pre-write snapshot and persist that stale network back over the
  // newer record. Its one limit is that a host whose onSync needs state the
  // teardown itself destroyed (an idle lock clearing its encryption key before
  // unmounting) still rejects the write — flushing here cannot resurrect
  // host-side preconditions. The user-facing exit path therefore awaits the
  // full flush before invoking onExit (Navigation.handleExit) rather than
  // relying on this.
  useEffect(() => {
    return () => {
      void reduxStore.flushSync();
    };
  }, [reduxStore]);

  // In e2e mode, expose the live Redux store to Playwright tests so they can
  // inspect the network/session state directly instead of waiting for a sync
  // round-trip. Mirrors the pattern used by `__e2eMap` in Geospatial.
  useEffect(() => {
    if (!flags?.isE2E || typeof window === 'undefined') return;
    window.__interviewStore = reduxStore;
    return () => {
      if (window.__interviewStore === reduxStore) {
        window.__interviewStore = undefined;
      }
    };
  }, [reduxStore, flags?.isE2E]);

  const onTrackerChange = useCallback((next: Tracker) => {
    trackerRef.current = next;
  }, []);

  // A finished session opens in its completed state, at the finish stage the
  // host recorded.
  const initialCompletion = useMemo<InterviewCompletion | null>(
    () =>
      payload.session.finishTime === null
        ? null
        : {
            stageId: payload.session.finishStageId ?? null,
            finishedHere: false,
          },
    [payload.session.finishTime, payload.session.finishStageId],
  );

  const reviewEntry = useMemo(() => {
    // A review stops before the finish stage, so a step at or past it enters
    // at the last stage the review can show.
    const finishIndex = payload.protocol.stages.findIndex(
      (stage) => stage.type === 'FinishSession',
    );
    const reviewEnd =
      finishIndex === -1 ? payload.protocol.stages.length : finishIndex;
    if (
      reviewMode !== true ||
      currentStep === undefined ||
      currentStep < reviewEnd
    ) {
      return {
        currentStep,
        initialStageOverrideIndex,
      };
    }

    const lastAvailableStage = getLastAvailableAuthoredStageIndex(
      payload.protocol.stages,
      payload.session.network,
    );
    const hasAuthoredStage = reviewEnd > 0;

    return {
      currentStep: lastAvailableStage ?? 0,
      initialStageOverrideIndex:
        lastAvailableStage === undefined && hasAuthoredStage
          ? 0
          : initialStageOverrideIndex,
    };
  }, [
    currentStep,
    initialStageOverrideIndex,
    payload.protocol.stages,
    payload.session.network,
    reviewMode,
  ]);

  return (
    <AnalyticsProvider
      analytics={analytics}
      posthogClient={posthogClient}
      disableAnalytics={disableAnalytics || reviewMode === true}
      payload={payload}
      onTrackerChange={onTrackerChange}
    >
      <Provider store={reduxStore}>
        <InterviewLocalization
          requestedLocales={requestedLocales}
          localeOptions={payload.session.localeOptions}
        >
          <SyncFlushProvider flush={reduxStore.flushSync}>
            <WritesInFlightProvider
              writesSettled={reduxStore.writesSettled}
              trackWrite={reduxStore.trackWrite}
            >
              <ContractProvider
                onFinish={onFinish}
                onRequestAsset={onRequestAsset}
                flags={flags}
                finishConfirmationDescription={finishConfirmationDescription}
              >
                <InterviewCompletionProvider
                  // A new payload is a new interview.
                  key={payload.session.id}
                  initialCompletion={initialCompletion}
                  completedActions={completedActions}
                  // A finished interview never records a language change.
                  onComplete={reduxStore.markFinished}
                >
                  <CurrentStepProvider
                    currentStep={reviewEntry.currentStep}
                    onStepChange={onStepChange}
                  >
                    <Interview
                      onExit={onExit}
                      hideNavigation={hideNavigation}
                      navigationOrientation={navigationOrientation}
                      navigationClassnames={navigationClassnames}
                      allowStageNavigation={
                        allowStageNavigation &&
                        (currentStep === undefined ||
                          onStepChange !== undefined)
                      }
                      allowUserScaling={allowUserScaling}
                      initialTextScale={initialTextScale}
                      onTextScaleChange={onTextScaleChange}
                      initialStageOverrideIndex={
                        reviewEntry.initialStageOverrideIndex
                      }
                      reviewMode={reviewMode}
                    />
                  </CurrentStepProvider>
                </InterviewCompletionProvider>
              </ContractProvider>
            </WritesInFlightProvider>
          </SyncFlushProvider>
        </InterviewLocalization>
      </Provider>
    </AnalyticsProvider>
  );
};

export default Shell;
