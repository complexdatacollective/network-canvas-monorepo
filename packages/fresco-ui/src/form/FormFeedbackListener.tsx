'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

type FormFeedback = {
  /**
   * Called each time a form inside the listener refuses a submission: its
   * fields failed validation, or its submit handler returned errors. Called
   * once the errors are on screen, as the form moves focus to the first.
   */
  onInvalidSubmit?: () => void;
  /**
   * Called each time a person chooses an option in a field inside the
   * listener: `true` when they select, tick or turn on an option (choosing a
   * different option of a single-choice field included), `false` when they
   * untick, turn off or clear one. Called for the person's own change only,
   * never for a value set by the program (an initial value, a reset, or a
   * form being restored).
   */
  onOptionToggle?: (selected: boolean) => void;
};

const NO_FEEDBACK: Required<FormFeedback> = {
  onInvalidSubmit: () => undefined,
  onOptionToggle: () => undefined,
};

const FormFeedbackListenerContext =
  createContext<Required<FormFeedback>>(NO_FEEDBACK);

type FormFeedbackListenerProps = FormFeedback & {
  children?: ReactNode;
};

/**
 * Tells its owner about what people do in the forms and fields inside it, for
 * feedback that belongs to the surroundings rather than to one form (the
 * interview's sounds): every refused submission, and every option chosen or
 * cleared. Each form still shows and focuses its own errors.
 */
export function FormFeedbackListener({
  onInvalidSubmit,
  onOptionToggle,
  children,
}: FormFeedbackListenerProps) {
  // The latest callbacks, behind functions that stay the same for the life
  // of the listener, so a form does not re-run its effects each time the
  // owner renders.
  const latest = useRef({ onInvalidSubmit, onOptionToggle });
  useLayoutEffect(() => {
    latest.current = { onInvalidSubmit, onOptionToggle };
  });
  const feedback = useMemo<Required<FormFeedback>>(
    () => ({
      onInvalidSubmit: () => latest.current.onInvalidSubmit?.(),
      onOptionToggle: (selected) => latest.current.onOptionToggle?.(selected),
    }),
    [],
  );
  return (
    <FormFeedbackListenerContext value={feedback}>
      {children}
    </FormFeedbackListenerContext>
  );
}

/**
 * The nearest `FormFeedbackListener`'s callbacks, which do nothing when there
 * is none. They are stable for the life of the listener.
 */
export const useFormFeedback = (): Required<FormFeedback> =>
  useContext(FormFeedbackListenerContext);
