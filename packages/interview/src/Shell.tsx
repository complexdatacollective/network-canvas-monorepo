'use client';
'use no memo';

import { Toast } from '@base-ui/react/toast';
import type { Store } from '@reduxjs/toolkit';
import { AnimatePresence, motion } from 'motion/react';
import type { PostHog } from 'posthog-js';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Provider } from 'react-redux';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { NULL_TRACKER, type Tracker } from './analytics/tracker';
import { useStageNavigationAnalytics } from './analytics/useStageNavigationAnalytics';
import { GeospatialOfflineIndicator } from './components/GeospatialOfflineIndicator';
import Navigation from './components/Navigation';
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
  SyncHandler,
} from './contract/types';
import useInterviewNavigation from './hooks/useInterviewNavigation';
import useMediaQuery from './hooks/useMediaQuery';
import { store, type RootState } from './store/store';
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

function Interview({
  onExit,
  hideNavigation = false,
  navigationOrientation: orientationProp,
  navigationClassnames,
  allowStageNavigation,
  initialStageOverrideIndex,
}: {
  onExit?: () => void;
  hideNavigation?: boolean;
  navigationOrientation?: NavigationOrientation;
  navigationClassnames?: NavigationClassnames;
  allowStageNavigation?: boolean;
  initialStageOverrideIndex?: number;
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
  } = useInterviewNavigation(initialStageOverrideIndex);

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

  return (
    <ThemedRegion
      theme="interview"
      render={
        <main
          className={cx(
            'relative flex size-full flex-1 overflow-hidden',
            // Viewport-width ramp for the --theme-root-size type-scale sentinel,
            // scoped to the Shell so only the full-screen interview scales (not
            // other themed regions). Keep breakpoints synced with
            // --breakpoint-laptop / --breakpoint-desktop-lg in theme.css.
            'laptop:[--theme-root-size:1.125rem] desktop-lg:[--theme-root-size:1.25rem] [--theme-root-size:1rem]',
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
                    className="flex min-h-0 min-w-0 flex-1"
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
  onExit?: () => void;
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
  onExit,
  hideNavigation,
  navigationOrientation,
  navigationClassnames,
  allowStageNavigation,
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

  return (
    <AnalyticsProvider
      analytics={analytics}
      posthogClient={posthogClient}
      disableAnalytics={disableAnalytics}
      payload={payload}
      onTrackerChange={onTrackerChange}
    >
      <Provider store={reduxStore}>
        <ContractProvider
          onFinish={onFinish}
          onRequestAsset={onRequestAsset}
          flags={flags}
        >
          <CurrentStepProvider
            currentStep={currentStep}
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
              initialStageOverrideIndex={initialStageOverrideIndex}
            />
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    </AnalyticsProvider>
  );
};

export default Shell;
