"use client";
"use no memo";

import DialogProvider from "@codaco/fresco-ui/dialogs/DialogProvider";
import { cx } from "@codaco/fresco-ui/utils/cva";
import { AnimatePresence, motion } from "motion/react";
import type { PostHog } from "posthog-js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Provider } from "react-redux";
import { AnalyticsProvider } from "./analytics/AnalyticsProvider";
import { NULL_TRACKER, type Tracker } from "./analytics/tracker";
import { useStageNavigationAnalytics } from "./analytics/useStageNavigationAnalytics";
import Navigation from "./components/Navigation";
import StageErrorBoundary from "./components/StageErrorBoundary";
import { CurrentStepProvider } from "./contexts/CurrentStepContext";
import { StageMetadataProvider } from "./contexts/StageMetadataContext";
import { ContractProvider, useContractFlags } from "./contract/context";
import type {
	AssetRequestHandler,
	FinishHandler,
	InterviewAnalyticsMetadata,
	InterviewerFlags,
	InterviewPayload,
	StepChangeHandler,
	SyncHandler,
} from "./contract/types";
import useInterviewNavigation from "./hooks/useInterviewNavigation";
import useMediaQuery from "./hooks/useMediaQuery";
import { store } from "./store/store";
import { InterviewToastProvider } from "./toast/InterviewToast";

const variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

function Interview() {
	const {
		stage,
		displayedStep,
		showStage,
		CurrentInterface,
		registerBeforeNext,
		getNavigationHelpers,
		handleExitComplete,
		moveForward,
		moveBackward,
		disableMoveForward,
		disableMoveBackward,
		pulseNext,
		progress,
	} = useInterviewNavigation();

	const { isE2E } = useContractFlags();

	useStageNavigationAnalytics({
		stage_index: displayedStep,
		stage_type: stage?.type,
	});

	const forwardButtonRef = useRef<HTMLButtonElement>(null);
	const backButtonRef = useRef<HTMLButtonElement>(null);

	const isPortraitAspectRatio = useMediaQuery("(max-aspect-ratio: 3/4)");
	const navigationOrientation = isPortraitAspectRatio ? "horizontal" : "vertical";

	// In E2E mode, use instant transitions so tests don't need to wait for
	// animation completion before accessing stage content.
	const transitionDuration = isE2E ? 0 : 0.5;

	return (
		<main
			data-theme-interview
			className={cx(
				"relative flex size-full flex-1 overflow-hidden bg-background text-text",
				isPortraitAspectRatio ? "flex-col" : "flex-row-reverse",
			)}
		>
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
								className="flex min-h-0 flex-1"
								initial={isE2E ? false : "initial"}
								animate="animate"
								exit="exit"
								variants={variants}
								transition={{ duration: transitionDuration }}
							>
								<div className="flex size-full flex-col items-center justify-center" id="stage" key={stage.id}>
									<StageErrorBoundary>
										{CurrentInterface && (
											<CurrentInterface key={stage.id} stage={stage} getNavigationHelpers={getNavigationHelpers} />
										)}
									</StageErrorBoundary>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</InterviewToastProvider>
			</StageMetadataProvider>
			<Navigation
				moveBackward={moveBackward}
				moveForward={moveForward}
				disableMoveForward={disableMoveForward}
				disableMoveBackward={disableMoveBackward}
				pulseNext={pulseNext}
				progress={progress}
				orientation={navigationOrientation}
				forwardButtonRef={forwardButtonRef}
				backButtonRef={backButtonRef}
			/>
		</main>
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
}: ShellProps) => {
	// Anchor onSync in a ref so the store factory receives a stable callback
	// (the sync middleware closes over it once at store creation). Hosts
	// commonly pass an inline arrow, which would otherwise force the store to
	// be recreated on every host re-render.
	const onSyncRef = useRef(onSync);
	onSyncRef.current = onSync;
	const stableOnSync = useCallback<SyncHandler>((...args) => onSyncRef.current(...args), []);

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
		if (!flags?.isE2E || typeof window === "undefined") return;
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
				<ContractProvider onFinish={onFinish} onRequestAsset={onRequestAsset} flags={flags}>
					<CurrentStepProvider currentStep={currentStep} onStepChange={onStepChange}>
						{/*
						 * Interview-scoped DialogProvider (nested below the app-root one in
						 * components/Providers). Required because dialogs opened from inside
						 * the interview render components that call useSelector, and
						 * DialogProvider renders its dialogs at its own location in the tree.
						 * Without this inner provider, dialog content would mount outside
						 * the Redux Provider and throw on the first useSelector call.
						 */}
						<DialogProvider>
							<Interview />
						</DialogProvider>
					</CurrentStepProvider>
				</ContractProvider>
			</Provider>
		</AnalyticsProvider>
	);
};

export default Shell;
