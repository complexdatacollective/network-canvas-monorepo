'use client';
'use no memo';

import { Toast } from '@base-ui/react/toast';
import type { Store } from '@reduxjs/toolkit';
import { AnimatePresence, motion } from 'motion/react';
import type { PostHog } from 'posthog-js';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Provider } from 'react-redux';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { NULL_TRACKER, type Tracker } from './analytics/tracker';
import { useStageNavigationAnalytics } from './analytics/useStageNavigationAnalytics';
import { GeospatialOfflineIndicator } from './components/GeospatialOfflineIndicator';
import Navigation, { TEXT_SCALE_OPTIONS } from './components/Navigation';
import StageErrorBoundary from './components/StageErrorBoundary';
import { CurrentStepProvider } from './contexts/CurrentStepContext';
import { StageMetadataProvider } from './contexts/StageMetadataContext';
import { ContractProvider } from './contract/context';
import type {
  AssetRequestHandler,
  FinishHandler,
  InterviewAnalyticsMetadata,
  InterviewerFlags,
  InterviewPayload,
  StepChangeHandler,
  SyncFlushRegistrar,
  SyncHandler,
} from './contract/types';
import useInterviewNavigation from './hooks/useInterviewNavigation';
import useMediaQuery from './hooks/useMediaQuery';
import { getLastAvailableAuthoredStageIndex } from './selectors/skip-logic';
import { store, type RootState } from './store/store';
import { SyncFlushProvider } from './store/SyncFlushContext';
import {
  InterviewToastProvider,
  InterviewToastViewport,
} from './toast/InterviewToast';
import { interviewToastManager } from './toast/interviewToastManager';

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

function Interview({
  onExit,
  hideNavigation = false,
  navigationOrientation: orientationProp,
  navigationClassnames,
  allowStageNavigation,
  allowUserScaling,
  initialTextScale,
  onTextScaleChange,
  initialStageOverrideIndex,
  reviewMode,
}: {
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
}) {
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

  // Participant-chosen multiplier applied on top of the viewport ramp below.
  // Owned here so it survives stage navigation; hosts opt in via
  // `allowUserScaling` and may persist it across remounts (e.g. the
  // Interviewer's lock screen) with `initialTextScale`/`onTextScaleChange`.
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
  const textScaleStyle: CSSProperties & { '--interview-text-scale': number } = {
    '--interview-text-scale': textScale,
  };

  return (
    <ThemedRegion
      theme="interview"
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
      <DialogProvider>
        <DndStoreProvider>
          <StageMetadataProvider value={registerBeforeNext}>
            <InterviewToastProvider
              forwardButtonRef={forwardButtonRef}
              backButtonRef={backButtonRef}
              orientation={navigationOrientation}
            >
              <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
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
              onTextScaleChange={handleTextScaleChange}
            />
          )}
          {/*
           * Self-contained Toast.Provider for the interview manager so
           * the viewport's portal lands inside ThemedRegion (themed
           * surface + portal-container context) regardless of what the
           * host sets up. Hosts may still mount their own app-level
           * Toast.Provider for non-interview toasts; the two are
           * independent channels.
           */}
          <Toast.Provider toastManager={interviewToastManager}>
            <InterviewToastViewport />
          </Toast.Provider>
        </DndStoreProvider>
      </DialogProvider>
    </ThemedRegion>
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
  payload: InterviewPayload;
  onSync: SyncHandler;
  onFinish: FinishHandler;
  onRequestAsset: AssetRequestHandler;
  currentStep?: number;
  onStepChange?: StepChangeHandler;
  flags?: InterviewerFlags;
  analytics: InterviewAnalyticsMetadata;
  posthogClient?: PostHog;
  disableAnalytics?: boolean;
  /**
   * Host-specific explanation shown in the finish confirmation dialog.
   */
  finishConfirmationDescription?: string;
  onExit?: () => void;
  /**
   * Lend this Shell's autosave flush to the host so it can write pending
   * answers before doing something the flush could not survive — see
   * `SyncFlushRegistrar`. Hosts whose `onSync` works at any time (the common
   * case) can leave this out; the Shell's own teardown flush covers them.
   */
  registerSyncFlush?: SyncFlushRegistrar;
  /**
   * Adapt the Shell for reviewing an existing interview: stop at the final
   * authored stage, use review-specific exit messaging, and suppress interview
   * analytics. The host remains responsible for supplying non-persisting sync
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
   * session. When neither this nor `onExit` is set, the Navigation renders no
   * settings menu.
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
  payload,
  onSync,
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
  registerSyncFlush,
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
        isDevelopment: flags?.isDevelopment,
        tracker: trackerHolder,
      }),
    [payload, stableOnSync, flags?.isDevelopment, trackerHolder],
  );

  // Autosave holds pending session changes on a trailing debounce
  // (syncMiddleware). If the Shell unmounts mid-window — the host navigated
  // away, e.g. an interview exit or a lock screen — that timer would fire
  // seconds AFTER the host moved on, racing whatever reads the stored session
  // next: a prompt resume would hydrate the pre-write snapshot and its own
  // autosaves would then persist that stale network back over the newer
  // record. Flush at teardown instead: the pending write is handed to onSync
  // synchronously (when no other write is on the wire), before the host can
  // re-read the session. Two limits: the user-facing exit path additionally
  // awaits the full flush before invoking onExit (Navigation.handleExit),
  // because when a write IS on the wire the final snapshot can only be
  // enqueued after it settles; and a host whose onSync needs state the
  // teardown already destroyed (e.g. an idle lock that cleared its store
  // encryption key before unmounting) still rejects the write — flushing
  // here cannot resurrect host-side preconditions, so such a host has to flush
  // before it destroys them — which is what `registerSyncFlush` below is for.
  useEffect(() => {
    return () => {
      void reduxStore.flushSync();
    };
  }, [reduxStore]);

  // Hand the flush to a host that needs to write pending answers at a moment of
  // its own choosing. The Interviewer's idle lock is that moment: clearing the
  // encryption key its `onSync` writes with is itself what unmounts this Shell,
  // so the teardown flush above can only ever run after the key is gone. Given
  // the flush up front, the host runs it while the key is still live and the
  // teardown flush then finds nothing pending.
  useEffect(() => {
    if (!registerSyncFlush) return undefined;
    return registerSyncFlush(reduxStore.flushSync);
  }, [registerSyncFlush, reduxStore]);

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

  const reviewEntry = useMemo(() => {
    if (
      reviewMode !== true ||
      currentStep === undefined ||
      currentStep < payload.protocol.stages.length
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
    const hasAuthoredStage = payload.protocol.stages.length > 0;

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
        <SyncFlushProvider flush={reduxStore.flushSync}>
          <ContractProvider
            onFinish={onFinish}
            onRequestAsset={onRequestAsset}
            flags={flags}
            finishConfirmationDescription={finishConfirmationDescription}
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
                  (currentStep === undefined || onStepChange !== undefined)
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
          </ContractProvider>
        </SyncFlushProvider>
      </Provider>
    </AnalyticsProvider>
  );
};

export default Shell;
