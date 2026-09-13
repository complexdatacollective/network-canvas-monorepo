'use client';

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '../store/store';
import { SUPER_PROPS } from './PROPERTY_KEYS';
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
  const stages = useSelector((s: RootState) => s.protocol?.stages) as
    | StageShape[]
    | undefined;
  const promptIndex = useSelector(
    (s: RootState) => s.session?.promptIndex ?? 0,
  );

  const lastIndexRef = useRef<number | null>(null);
  const lastEnteredAtRef = useRef<number | null>(null);
  const lastPromptCountRef = useRef(1);
  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const completionTrackedRef = useRef(false);
  const unmountCleanupScheduledRef = useRef(false);
  const emitStageExitRef = useRef<
    (now: number, exit_direction: string) => void
  >(() => {});

  const promptCount = stages?.[stage_index]?.prompts?.length ?? 1;

  useEffect(() => {
    emitStageExitRef.current = (now, exit_direction) => {
      const previousIndex = lastIndexRef.current;
      const previousEnteredAt = lastEnteredAtRef.current;
      if (previousIndex === null || previousEnteredAt === null) return;

      const duration_ms = Math.max(0, now - previousEnteredAt);
      const previousType = stages?.[previousIndex]?.type;
      track('stage_exited', {
        [SUPER_PROPS.STAGE_TYPE]: previousType,
        [SUPER_PROPS.STAGE_INDEX]: previousIndex,
        duration_ms,
        prompt_count: lastPromptCountRef.current,
        exit_direction,
      });
    };
  }, [stages, track]);

  useEffect(() => {
    const now = performance.now();

    if (!startedRef.current) {
      track('interview_started');
      startedRef.current = true;
      startedAtRef.current = now;
    }

    // An unavailable saved/current step is render-gated while navigation
    // recovers. It was never shown, so it must not enter the stage analytics
    // history or generate a matching exit event later.
    if (!enabled) {
      return;
    }

    const previousIndex = lastIndexRef.current;
    const previousEnteredAt = lastEnteredAtRef.current;

    // Effect replay in React StrictMode must not duplicate an event for the
    // same displayed stage. Prompt changes are tracked by the metadata effect
    // below and do not re-enter this stage.
    if (previousIndex === stage_index && previousEnteredAt !== null) {
      return;
    }

    if (
      previousIndex !== null &&
      previousEnteredAt !== null &&
      previousIndex !== stage_index
    ) {
      emitStageExitRef.current(
        now,
        stage_index > previousIndex
          ? 'forward'
          : stage_index < previousIndex
            ? 'back'
            : 'jumped',
      );
    }

    const direction =
      previousIndex === null
        ? 'initial'
        : stage_index === previousIndex + 1
          ? 'forward'
          : stage_index === previousIndex - 1
            ? 'back'
            : stage_index === previousIndex
              ? 'initial'
              : 'jumped';

    track('stage_entered', {
      [SUPER_PROPS.STAGE_TYPE]: stage_type,
      [SUPER_PROPS.STAGE_INDEX]: stage_index,
      prompt_index: promptIndex,
      direction,
    });

    if (stage_type === 'FinishSession') {
      const startedAt = startedAtRef.current ?? now;
      if (!completionTrackedRef.current) {
        completionTrackedRef.current = true;
        track('interview_finished', {
          stage_count: stages?.length ?? 0,
          total_duration_ms: Math.max(0, now - startedAt),
        });
      }
    }

    lastIndexRef.current = stage_index;
    lastEnteredAtRef.current = now;
    lastPromptCountRef.current = promptCount;
  }, [
    enabled,
    promptCount,
    promptIndex,
    stage_index,
    stage_type,
    stages,
    track,
  ]);

  useEffect(() => {
    // Prompt navigation does not change the displayed stage, so it must update
    // the exit metadata without re-emitting stage_entered.
    if (lastIndexRef.current === stage_index) {
      lastPromptCountRef.current = promptCount;
    }
  }, [promptCount, stage_index]);

  useEffect(() => {
    // React StrictMode runs an effect cleanup immediately before re-running its
    // setup. Defer the teardown emission by one microtask so that probe cleanup
    // is cancelled by the second setup, while a real unmount still records the
    // final stage exactly once.
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
