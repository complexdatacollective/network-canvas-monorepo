"use client";

import { useSelector } from "react-redux";
import { useCurrentStep } from "../contexts/CurrentStepContext";
import type { RootState } from "../store/store";

/**
 * `useSelector` for selectors that depend on the current stage step.
 *
 * Reads `displayedStep` (not `currentStep`) so selectors stay stable for the
 * stage that's actually rendered right now. During an AnimatePresence exit
 * animation, the host has already moved `currentStep` to the next stage but
 * the previous stage's components are still mounted; they should keep seeing
 * their own data until the exit completes and `displayedStep` catches up.
 *
 * For navigation logic that needs the *target* step (e.g. computing the next
 * valid stage to advance to) read `currentStep` directly via `useCurrentStep`.
 */
export function useStageSelector<T>(selector: (state: RootState, currentStep: number) => T): T {
	const { displayedStep } = useCurrentStep();
	return useSelector((state: RootState) => selector(state, displayedStep));
}
