'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { CompletedAction } from '../contract/types';

/**
 * A finished interview: the finish stage it ended at, and whether it was
 * finished in this Shell (rather than opened already finished), which is when
 * the completed state takes focus and is announced.
 */
export type InterviewCompletion = Readonly<{
  stageId: string | null;
  finishedHere: boolean;
}>;

type InterviewCompletionValue = Readonly<{
  completion: InterviewCompletion | null;
  /** Called once the host has recorded the finish. */
  complete: (stageId: string) => void;
  completedActions: readonly CompletedAction[];
}>;

const NO_ACTIONS: readonly CompletedAction[] = [];

const InterviewCompletionContext =
  createContext<InterviewCompletionValue | null>(null);

export function InterviewCompletionProvider({
  initialCompletion,
  completedActions = NO_ACTIONS,
  onComplete,
  children,
}: {
  initialCompletion: InterviewCompletion | null;
  completedActions?: readonly CompletedAction[];
  /** Called once the host has recorded the finish, before the state shows. */
  onComplete?: () => void;
  children: ReactNode;
}) {
  const [completion, setCompletion] = useState(initialCompletion);
  const complete = useCallback(
    (stageId: string) => {
      onComplete?.();
      setCompletion({ stageId, finishedHere: true });
    },
    [onComplete],
  );
  const value = useMemo(
    () => ({ completion, complete, completedActions }),
    [completion, complete, completedActions],
  );
  return (
    <InterviewCompletionContext.Provider value={value}>
      {children}
    </InterviewCompletionContext.Provider>
  );
}

const outsideShell: InterviewCompletionValue = {
  completion: null,
  complete: () => undefined,
  completedActions: NO_ACTIONS,
};

/**
 * The interview's completed state. Outside a Shell (an interface rendered on
 * its own in a story or test) the interview is never finished.
 */
export function useInterviewCompletion(): InterviewCompletionValue {
  return useContext(InterviewCompletionContext) ?? outsideShell;
}
