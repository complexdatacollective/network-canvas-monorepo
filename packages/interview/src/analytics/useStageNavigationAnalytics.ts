'use client';

import { useEffect, useRef } from 'react';
import { useSelector, useStore } from 'react-redux';

import type {
  PromptTimingExit,
  StageTimingExit,
  StageTimingExitDirection,
} from '../contract/types';
import { recordStageTiming } from '../store/modules/session';
import { type RootState, useAppDispatch } from '../store/store';
import { SUPER_PROPS } from './PROPERTY_KEYS';
import { registerStageTimingLifecycle } from './stageTimingLifecycle';
import { useTrack } from './useTrack';

type StageDescriptor = {
  stage_type?: string;
  stage_index: number;
  enabled?: boolean;
};

type StageShape = {
  type?: string;
  prompts?: unknown[];
};

type ExitDirection = StageTimingExitDirection;

function transitionDirection(previousIndex: number, nextIndex: number) {
  if (nextIndex === previousIndex + 1) return 'forward' as const;
  if (nextIndex === previousIndex - 1) return 'back' as const;
  return 'jumped' as const;
}

function isSyntheticFinishStage(
  stages: StageShape[] | undefined,
  stageIndex: number,
): boolean {
  return stages !== undefined && stageIndex === stages.length;
}

/**
 * Emits stage-level navigation events. Called from the Interview component
 * whenever the displayed step changes.
 *
 * `currentStep` is host-managed via CurrentStepContext, so the package's
 * Redux listener middleware cannot observe transitions. We do the bookkeeping
 * here, in the React tree, where we have access to both the displayed step
 * and the protocol's stages list.
 */
export function useStageNavigationAnalytics({
  stage_index,
  stage_type,
  enabled = true,
}: StageDescriptor): void {
  const track = useTrack();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const stages = useSelector((s: RootState) => s.protocol?.stages) as
    | StageShape[]
    | undefined;
  const promptIndex = useSelector(
    (s: RootState) => s.session?.promptIndex ?? 0,
  );
  const persistedStageTiming = useSelector(
    (s: RootState) => s.session?.stageTiming,
  );

  const lastIndexRef = useRef<number | null>(null);
  const lastEnteredAtRef = useRef<number | null>(null);
  const lastPromptIndexRef = useRef(0);
  const lastPromptEnteredAtRef = useRef<number | null>(null);
  const lastPromptCountRef = useRef(1);
  // Completion analytics keeps an in-memory running total for the current
  // loaded runtime even after persisted history compacts. A resumed runtime
  // can only seed this from retained history; discarded intervals cannot be
  // reconstructed and are not silently presented as lossless lifetime data.
  const totalStageDurationRef = useRef(
    persistedStageTiming?.stageExits
      .filter((exit) => exit.stageType !== 'FinishSession')
      .reduce((sum, exit) => sum + exit.durationMs, 0) ?? 0,
  );
  const startedRef = useRef(false);
  const completionTrackedRef = useRef(false);
  const unmountCleanupScheduledRef = useRef(false);
  const emitStageExitRef = useRef<
    (now: number, exit_direction: ExitDirection) => void
  >(() => {});
  const emitPromptExitRef = useRef<
    (now: number, exit_direction: ExitDirection) => PromptTimingExit | undefined
  >(() => {});

  const promptCount = stages?.[stage_index]?.prompts?.length ?? 1;

  useEffect(() => {
    emitPromptExitRef.current = (now, exit_direction) => {
      const previousIndex = lastIndexRef.current;
      const previousEnteredAt = lastPromptEnteredAtRef.current;
      if (previousIndex === null || previousEnteredAt === null)
        return undefined;
      if (isSyntheticFinishStage(stages, previousIndex)) return undefined;

      const promptExit = {
        stageIndex: previousIndex,
        stageType: stages?.[previousIndex]?.type ?? 'unknown',
        promptIndex: lastPromptIndexRef.current,
        promptCount: lastPromptCountRef.current,
        durationMs: Math.max(0, now - previousEnteredAt),
        exitDirection: exit_direction,
      };
      track('prompt_exited', {
        [SUPER_PROPS.STAGE_TYPE]: promptExit.stageType,
        [SUPER_PROPS.STAGE_INDEX]: previousIndex,
        [SUPER_PROPS.PROMPT_INDEX]: promptExit.promptIndex,
        duration_ms: promptExit.durationMs,
        prompt_count: promptExit.promptCount,
        exit_direction,
      });
      return promptExit;
    };

    emitStageExitRef.current = (now, exit_direction) => {
      const previousIndex = lastIndexRef.current;
      const previousEnteredAt = lastEnteredAtRef.current;
      if (previousIndex === null || previousEnteredAt === null) return;

      // Redux stores only authored protocol stages. The runtime appends its
      // FinishSession presentation step at the index immediately after them.
      // It has no corresponding stage or prompt timing record.
      if (isSyntheticFinishStage(stages, previousIndex)) return;

      const duration_ms = Math.max(0, now - previousEnteredAt);
      const previousType = stages?.[previousIndex]?.type;
      const promptExit = emitPromptExitRef.current(now, exit_direction);

      totalStageDurationRef.current += duration_ms;
      const stageExit: StageTimingExit = {
        stageIndex: previousIndex,
        stageType: previousType ?? 'unknown',
        promptIndex: lastPromptIndexRef.current,
        promptCount: lastPromptCountRef.current,
        durationMs: duration_ms,
        exitDirection: exit_direction,
      };
      dispatch(recordStageTiming({ promptExit, stageExit }));
      track('stage_exited', {
        [SUPER_PROPS.STAGE_TYPE]: previousType,
        [SUPER_PROPS.STAGE_INDEX]: previousIndex,
        [SUPER_PROPS.PROMPT_INDEX]: lastPromptIndexRef.current,
        duration_ms,
        prompt_count: lastPromptCountRef.current,
        exit_direction,
      });
    };
  }, [dispatch, stages, track]);

  useEffect(() => {
    const now = performance.now();

    if (!startedRef.current) {
      track('interview_started');
      startedRef.current = true;
    }

    // An unavailable saved/current step is render-gated while navigation
    // recovers. It was never shown, so it must not enter the stage analytics
    // history or generate a matching exit event later.
    if (!enabled) return;

    const previousIndex = lastIndexRef.current;
    const previousEnteredAt = lastEnteredAtRef.current;

    // Effect replay in React StrictMode must not duplicate an event for the
    // same displayed stage. Prompt changes are tracked by the metadata effect.
    if (previousIndex === stage_index && previousEnteredAt !== null) return;

    if (previousIndex !== null && previousEnteredAt !== null) {
      emitStageExitRef.current(
        now,
        transitionDirection(previousIndex, stage_index),
      );
    }

    const direction =
      previousIndex === null
        ? 'initial'
        : transitionDirection(previousIndex, stage_index);

    track('stage_entered', {
      [SUPER_PROPS.STAGE_TYPE]: stage_type,
      [SUPER_PROPS.STAGE_INDEX]: stage_index,
      prompt_index: promptIndex,
      direction,
    });

    if (stage_type === 'FinishSession') {
      if (!completionTrackedRef.current) {
        completionTrackedRef.current = true;
        track('interview_finished', {
          stage_count: stages?.length ?? 0,
          total_duration_ms: totalStageDurationRef.current,
        });
      }
      dispatch(
        recordStageTiming({
          totalDurationMs: totalStageDurationRef.current,
        }),
      );
    }

    lastIndexRef.current = stage_index;
    lastEnteredAtRef.current = now;
    lastPromptIndexRef.current = promptIndex;
    lastPromptEnteredAtRef.current = now;
    lastPromptCountRef.current = promptCount;

    track('prompt_entered', {
      [SUPER_PROPS.STAGE_TYPE]: stage_type,
      [SUPER_PROPS.STAGE_INDEX]: stage_index,
      [SUPER_PROPS.PROMPT_INDEX]: promptIndex,
      prompt_count: promptCount,
    });
  }, [
    dispatch,
    enabled,
    promptCount,
    promptIndex,
    stage_index,
    stage_type,
    stages,
    track,
  ]);

  useEffect(() => {
    // Prompt navigation does not change the displayed stage, so it emits a
    // prompt-level transition while leaving stage_entered untouched.
    if (
      lastIndexRef.current !== stage_index ||
      lastPromptIndexRef.current === promptIndex
    ) {
      if (lastIndexRef.current === stage_index) {
        lastPromptCountRef.current = promptCount;
      }
      return;
    }

    const now = performance.now();
    const direction: ExitDirection =
      promptIndex > lastPromptIndexRef.current ? 'forward' : 'back';
    const promptExit = emitPromptExitRef.current(now, direction);
    if (promptExit) dispatch(recordStageTiming({ promptExit }));
    lastPromptIndexRef.current = promptIndex;
    lastPromptEnteredAtRef.current = now;
    lastPromptCountRef.current = promptCount;
    track('prompt_entered', {
      [SUPER_PROPS.STAGE_TYPE]: stage_type,
      [SUPER_PROPS.STAGE_INDEX]: stage_index,
      [SUPER_PROPS.PROMPT_INDEX]: promptIndex,
      prompt_count: promptCount,
    });
  }, [promptCount, promptIndex, stage_index, stage_type, track]);

  useEffect(
    () =>
      registerStageTimingLifecycle(store, {
        abandon: () => {
          emitStageExitRef.current(performance.now(), 'abandoned');
          lastEnteredAtRef.current = null;
          lastPromptEnteredAtRef.current = null;
        },
        resume: () => {
          if (
            lastIndexRef.current === null ||
            lastEnteredAtRef.current !== null
          ) {
            return;
          }
          const now = performance.now();
          lastEnteredAtRef.current = now;
          lastPromptEnteredAtRef.current = now;
        },
      }),
    [store],
  );

  useEffect(() => {
    // React StrictMode runs an effect cleanup immediately before re-running its
    // setup. Defer the teardown emission by one microtask so probe cleanup is
    // cancelled while a real unmount still records the final authored stage.
    unmountCleanupScheduledRef.current = false;
    return () => {
      if (unmountCleanupScheduledRef.current) return;
      unmountCleanupScheduledRef.current = true;
      queueMicrotask(() => {
        if (!unmountCleanupScheduledRef.current) return;
        unmountCleanupScheduledRef.current = false;
        emitStageExitRef.current(performance.now(), 'abandoned');
      });
    };
  }, []);
}
