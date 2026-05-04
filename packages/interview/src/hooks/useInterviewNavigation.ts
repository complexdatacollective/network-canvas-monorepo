"use client";

import { invariant } from "es-toolkit";
import { type ElementType, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useStepControl } from "../contract/context";
import { getStages } from "../ducks/modules/protocol";
import { updatePrompt, updateStage } from "../ducks/modules/session";
import getInterface from "../interfaces";
import { getCurrentStage, getNavigationInfo, getPromptCount, getStageCount } from "../selectors/session";
import { getNavigableStages } from "../selectors/skip-logic";
import { calculateProgress } from "../selectors/utils";
import type { BeforeNextFunction, Direction, RegisterBeforeNext, StageProps } from "../types";
import useReadyForNextStage from "./useReadyForNextStage";

export default function useInterviewNavigation() {
	const dispatch = useDispatch();

	// "Intended step" can be host-controlled (Shell receives currentStep +
	// onStepChange props) or package-internal. The host is responsible for
	// persisting the value if desired (URL, localStorage, etc.).
	const { currentStep: controlledStep, onStepChange } = useStepControl();
	const isControlled = controlledStep !== undefined;
	const [internalStep, setInternalStep] = useState<number>(controlledStep ?? 0);
	const intendedStep = isControlled ? controlledStep : internalStep;

	const setStep = useCallback(
		(next: number) => {
			if (isControlled) {
				onStepChange?.(next);
			} else {
				setInternalStep(next);
			}
		},
		[isControlled, onStepChange],
	);

	const [forceNavigationDisabled, setForceNavigationDisabled] = useState(false);

	// Two-phase navigation state.
	// Starts false so that AnimatePresence sees the first child as "entering"
	// rather than "appearing", which enables variant propagation to descendants.
	const [showStage, setShowStage] = useState(false);
	const pendingStepRef = useRef<number | null>(null);
	const isTransitioningRef = useRef(false);

	// Show the stage on mount (before paint so there's no visual delay).
	useLayoutEffect(() => {
		setShowStage(true);
	}, []);

	// Selectors
	const stage = useSelector(getCurrentStage);
	const CurrentInterface = stage ? (getInterface(stage.type) as ElementType<StageProps>) : null;

	const { isReady: isReadyForNextStage } = useReadyForNextStage();
	const { currentStep, isLastPrompt, isFirstPrompt, promptIndex } = useSelector(getNavigationInfo);
	const { nextValidStageIndex, previousValidStageIndex, isCurrentStepValid } = useSelector(getNavigableStages);
	const stageCount = useSelector(getStageCount);
	const promptCount = useSelector(getPromptCount);
	const stages = useSelector(getStages);

	// Helper to get prompt count for a specific stage index
	const getPromptCountForStage = useCallback(
		(stageIndex: number) => {
			const targetStage = stages[stageIndex];
			if (targetStage && "prompts" in targetStage && targetStage.prompts) {
				return targetStage.prompts.length;
			}
			return 1; // Default to 1 if no prompts (same as getPromptCount selector)
		},
		[stages],
	);

	// Refs to avoid stale closures in navigation callbacks
	const nextValidStageIndexRef = useRef(nextValidStageIndex);
	const previousValidStageIndexRef = useRef(previousValidStageIndex);

	useEffect(() => {
		nextValidStageIndexRef.current = nextValidStageIndex;
	}, [nextValidStageIndex]);

	useEffect(() => {
		previousValidStageIndexRef.current = previousValidStageIndex;
	}, [previousValidStageIndex]);

	const [progress, setProgress] = useState(calculateProgress(currentStep, stageCount, promptIndex, promptCount));

	useEffect(() => {
		setProgress(calculateProgress(currentStep, stageCount, promptIndex, promptCount));
	}, [currentStep, stageCount, promptIndex, promptCount]);

	// beforeNext registration (multiple keyed handlers)
	const beforeNextHandlers = useRef(new Map<string, BeforeNextFunction>());
	const registerBeforeNext: RegisterBeforeNext = useCallback(
		(...args: [BeforeNextFunction | null] | [string, BeforeNextFunction | null]) => {
			if (args.length === 1) {
				const [fn] = args;
				if (fn === null) {
					beforeNextHandlers.current.clear();
				} else {
					beforeNextHandlers.current.set("default", fn);
				}
			} else {
				const [key, fn] = args;
				if (fn === null) {
					beforeNextHandlers.current.delete(key);
				} else {
					beforeNextHandlers.current.set(key, fn);
				}
			}
		},
		[],
	) as RegisterBeforeNext;

	/**
	 * Before navigation is allowed, we iterate all registered beforeNext handlers
	 * in insertion order. If any returns false, navigation is blocked. If any
	 * returns 'FORCE' (and none returned false), the prompt boundary is skipped.
	 */
	const canNavigate = async (direction: Direction) => {
		const handlers = beforeNextHandlers.current;
		if (handlers.size === 0) {
			return true;
		}

		let hasForce = false;
		for (const fn of handlers.values()) {
			const result = await fn(direction);

			invariant(
				result === true || result === false || result === "FORCE",
				`beforeNextFunction must return a boolean or the string 'FORCE'`,
			);

			if (result === false) {
				return false;
			}
			if (result === "FORCE") {
				hasForce = true;
			}
		}

		return hasForce ? "FORCE" : true;
	};

	const moveForward = useCallback(async () => {
		if (isTransitioningRef.current) return;
		setForceNavigationDisabled(true);

		await (async () => {
			const stageAllowsNavigation = await canNavigate("forwards");

			if (!stageAllowsNavigation) {
				return;
			}

			// Advance the prompt if we're not at the last one.
			if (stageAllowsNavigation !== "FORCE" && !isLastPrompt) {
				dispatch(updatePrompt(promptIndex + 1));
				return;
			}

			// From this point on we are definitely navigating stages
			const nextPromptCount = getPromptCountForStage(nextValidStageIndexRef.current);
			const fakeProgress = calculateProgress(nextValidStageIndexRef.current, stageCount, 0, nextPromptCount);
			setProgress(fakeProgress);
			registerBeforeNext(null);

			setStep(nextValidStageIndexRef.current);
		})();

		setForceNavigationDisabled(false);
	}, [dispatch, isLastPrompt, promptIndex, registerBeforeNext, stageCount, getPromptCountForStage, setStep]);

	const moveBackward = useCallback(async () => {
		if (isTransitioningRef.current) return;
		setForceNavigationDisabled(true);

		await (async () => {
			const stageAllowsNavigation = await canNavigate("backwards");

			if (!stageAllowsNavigation) {
				return;
			}

			if (stageAllowsNavigation !== "FORCE" && !isFirstPrompt) {
				dispatch(updatePrompt(promptIndex - 1));
				return;
			}

			const prevPromptCount = getPromptCountForStage(previousValidStageIndexRef.current);
			const fakeProgress = calculateProgress(previousValidStageIndexRef.current, stageCount, 0, prevPromptCount);
			setProgress(fakeProgress);
			registerBeforeNext(null);
			setStep(previousValidStageIndexRef.current);
		})();

		setForceNavigationDisabled(false);
	}, [setStep, dispatch, isFirstPrompt, promptIndex, registerBeforeNext, stageCount, getPromptCountForStage]);

	const getNavigationHelpers = useCallback(
		() => ({
			moveForward,
			moveBackward,
		}),
		[moveForward, moveBackward],
	);

	const handleExitComplete = useCallback(() => {
		const target = pendingStepRef.current;
		if (target === null) return;

		// Clear any stale beforeNext handlers that were re-registered by the
		// exiting stage during its exit animation renders. Without this,
		// interfaces that call registerBeforeNext() during render (e.g.
		// DyadCensus, EgoForm, SlidesForm) leave behind handlers with stale
		// closures that block navigation on the incoming stage.
		beforeNextHandlers.current.clear();

		dispatch(updateStage(target));
		pendingStepRef.current = null;
		setShowStage(true);
		isTransitioningRef.current = false;
	}, [dispatch]);

	// Two-phase navigation: when intended step changes, start exit animation.
	// Redux currentStep is NOT updated here — it's deferred to handleExitComplete.
	useEffect(() => {
		if (intendedStep !== currentStep) {
			pendingStepRef.current = intendedStep;
			if (!isTransitioningRef.current) {
				isTransitioningRef.current = true;
				setShowStage(false);
			}
		}
	}, [intendedStep, currentStep]);

	// If the current stage should be skipped, move to the previous valid stage.
	useEffect(() => {
		if (!isCurrentStepValid) {
			// eslint-disable-next-line no-console
			console.log("⚠️ Invalid stage! Moving you to the previous valid stage...");
			setStep(previousValidStageIndex);
		}
	}, [setStep, isCurrentStepValid, previousValidStageIndex]);

	const { canMoveForward, canMoveBackward } = useSelector(getNavigationInfo);

	return {
		// Stage rendering
		stage,
		currentStep,
		CurrentInterface,
		showStage,
		registerBeforeNext,
		getNavigationHelpers,
		handleExitComplete,

		// Navigation controls
		moveForward,
		moveBackward,
		disableMoveForward: forceNavigationDisabled || !showStage || !canMoveForward,
		disableMoveBackward:
			forceNavigationDisabled || !showStage || (!canMoveBackward && beforeNextHandlers.current.size === 0),
		pulseNext: isReadyForNextStage,
		progress,
	};
}
