'use client';

import { createContext, type ReactNode, useContext } from 'react';

const InvalidSubmitListenerContext = createContext<(() => void) | null>(null);

type InvalidSubmitListenerProps = {
  /**
   * Called each time a form inside this one refuses a submission: its
   * fields failed validation, or its submit handler returned errors. Called
   * once the errors are on screen, as the form moves focus to the first.
   */
  onInvalidSubmit: () => void;
  children?: ReactNode;
};

/**
 * Tells its owner about every refused submission of a form inside it, for
 * feedback that belongs to the surroundings rather than to one form (the
 * interview's error sound). Each form still shows and focuses its own errors.
 */
export function InvalidSubmitListener({
  onInvalidSubmit,
  children,
}: InvalidSubmitListenerProps) {
  return (
    <InvalidSubmitListenerContext value={onInvalidSubmit}>
      {children}
    </InvalidSubmitListenerContext>
  );
}

export const useInvalidSubmitListener = (): (() => void) | null =>
  useContext(InvalidSubmitListenerContext);
