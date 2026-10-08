'use client';

import { type ReactNode, useContext, useEffect, useRef } from 'react';

import type { ToastVariant } from '@codaco/fresco-ui/Toast';

import { useTrack } from '../analytics/useTrack';
import { StageMetadataContext } from '../contexts/StageMetadataContext';
import { useInterviewToast } from '../toast/useInterviewToast';
import type { Direction, NavigationIntent } from '../types';

type StageConstraint = {
  direction: 'forwards' | 'backwards' | 'both';
  isMet: boolean;
  /**
   * Structural validation kind for analytics. Stable, lowercase, snake_case.
   * Examples: "min_nodes", "required_field", "passphrase_mismatch".
   * Never a rendered message.
   */
  kind?: string;
  toast: {
    description: string | ReactNode;
    variant: ToastVariant;
    anchor: 'forward' | 'backward';
    icon?: ReactNode;
    timeout?: number;
  };
};

type UseStageValidationOptions = {
  constraints: StageConstraint[];
};

function useStageValidation({ constraints }: UseStageValidationOptions) {
  const registerBeforeNext = useContext(StageMetadataContext);
  const { showToast, closeToast } = useInterviewToast();
  const track = useTrack();

  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;

  // Track active constraint toasts: constraint index -> toast ID
  const activeToastsRef = useRef(new Map<number, string>());
  // Track previous isMet values for auto-close
  const prevIsMetRef = useRef<boolean[]>([]);

  // Auto-close toasts when constraints transition from unmet -> met
  useEffect(() => {
    const prevValues = prevIsMetRef.current;
    const activeToasts = activeToastsRef.current;

    constraints.forEach((constraint, index) => {
      if (constraint.isMet && prevValues[index] === false) {
        const toastId = activeToasts.get(index);
        if (toastId) {
          closeToast(toastId);
          activeToasts.delete(index);
        }
      }
    });

    prevIsMetRef.current = constraints.map((c) => c.isMet);
  }, [constraints, closeToast]);

  // Register the keyed beforeNext handler
  useEffect(() => {
    const handler = (direction: Direction, intent: NavigationIntent) => {
      if (intent === 'jump') {
        return true;
      }

      const currentConstraints = constraintsRef.current;
      const activeToasts = activeToastsRef.current;

      for (let i = 0; i < currentConstraints.length; i++) {
        const constraint = currentConstraints[i]!;
        const matchesDirection =
          constraint.direction === 'both' || constraint.direction === direction;

        if (matchesDirection && !constraint.isMet) {
          track('stage_validation_failed', {
            validation_kind: constraint.kind ?? 'unknown',
            direction,
          });

          if (!activeToasts.has(i)) {
            const toastId = showToast({
              ...constraint.toast,
              onRemove: () => {
                activeToasts.delete(i);
              },
            });

            activeToasts.set(i, toastId);
          }

          return false;
        }
      }

      return true;
    };

    registerBeforeNext('stageValidation', handler);

    const activeToasts = activeToastsRef.current;

    return () => {
      registerBeforeNext('stageValidation', null);

      for (const toastId of activeToasts.values()) {
        closeToast(toastId);
      }
      activeToasts.clear();
    };
  }, [registerBeforeNext, showToast, closeToast, track]);

  return { showToast, closeToast };
}

export default useStageValidation;
