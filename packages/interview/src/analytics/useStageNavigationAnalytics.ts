"use client";

import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";
import { SUPER_PROPS } from "./PROPERTY_KEYS";
import { useTrack } from "./useTrack";

type StageDescriptor = {
	stage_type?: string;
	stage_index: number;
};

/**
 * Emits stage-level navigation events. Called from the Interview component
 * whenever the displayed step changes.
 *
 * `currentStep` is host-managed via CurrentStepContext, so the package's
 * Redux listener middleware cannot observe transitions. We do the bookkeeping
 * here, in the React tree, where we have access to both the displayed step
 * and the protocol's stages list.
 */
export function useStageNavigationAnalytics({ stage_index, stage_type }: StageDescriptor): void {
	const track = useTrack();
	const stages = useSelector((s: RootState) => s.protocol?.stages) as Array<{ type?: string }> | undefined;

	const lastIndexRef = useRef<number | null>(null);
	const lastEnteredAtRef = useRef<number | null>(null);
	const startedRef = useRef(false);

	useEffect(() => {
		const now = Date.now();

		if (!startedRef.current) {
			track("interview_started");
			startedRef.current = true;
		}

		const previousIndex = lastIndexRef.current;
		const previousEnteredAt = lastEnteredAtRef.current;

		if (previousIndex !== null && previousEnteredAt !== null && previousIndex !== stage_index) {
			const previousType = stages?.[previousIndex]?.type;
			track("stage_exited", {
				[SUPER_PROPS.STAGE_TYPE]: previousType,
				[SUPER_PROPS.STAGE_INDEX]: previousIndex,
				duration_ms: now - previousEnteredAt,
				exit_direction: stage_index > previousIndex ? "forward" : stage_index < previousIndex ? "back" : "jumped",
			});
		}

		const direction =
			previousIndex === null
				? "initial"
				: stage_index === previousIndex + 1
					? "forward"
					: stage_index === previousIndex - 1
						? "back"
						: stage_index === previousIndex
							? "initial"
							: "jumped";

		track("stage_entered", {
			[SUPER_PROPS.STAGE_TYPE]: stage_type,
			[SUPER_PROPS.STAGE_INDEX]: stage_index,
			direction,
		});

		if (stage_type === "FinishSession") {
			track("interview_finished", { stage_count: stages?.length ?? 0 });
		}

		lastIndexRef.current = stage_index;
		lastEnteredAtRef.current = now;
	}, [stage_index, stage_type, stages, track]);
}
