import { act } from '@testing-library/react';

import type { CompoundEditResult } from '../../session.ts';
import type { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/** What the host does with the request it was holding, once it is let go. */
export type HostAnswer =
  /** The real in-memory host decides, as it would have without the hold. */
  | 'applies'
  /** The host answers, but declines to make the change. */
  | 'refuses'
  /** The host fails in a way that carries no answer at all. */
  | 'throws';

/**
 * Holds the host's answer to the next compound edits until the returned
 * function is called, so a test can do something else while one is in flight.
 *
 * The real host still decides, unless the release names another answer — this
 * only delays when it is asked, which is the one thing a request that answers
 * within the click cannot be made to do. Answering is what the returned
 * function waits for, so an assertion after it is about a settled editor.
 *
 * Shared between the quick-add suites because "what does the section do while
 * an answer is on its way" is one question asked of one seam, and a second
 * copy of this would be a second definition of what being in flight means.
 */
export const holdTheHost = (
  harness: ReturnType<typeof renderStageEditor>,
): ((answer?: HostAnswer) => Promise<void>) => {
  const { host } = harness;
  const answerForReal = host.submit.bind(host);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answer: HostAnswer = 'applies';
  // The host answers synchronously; the session accepts a promise from
  // `onCompoundEdit` and awaits it, which is what makes holding the answer
  // possible at all — so the replacement is written to the contract the
  // session has and cast through it.
  const deferred = async (
    ...request: Parameters<typeof answerForReal>
  ): Promise<CompoundEditResult> => {
    await held;
    if (answer === 'throws') throw new Error('the host is not answering');
    if (answer === 'refuses') {
      return {
        status: 'failed',
        reason: 'host-error',
        message: 'the host would not make this change',
      };
    }
    return answerForReal(...request);
  };
  host.submit = deferred as unknown as typeof host.submit;

  return async (settleAs: HostAnswer = 'applies') => {
    answer = settleAs;
    host.submit = answerForReal;
    release();
    await act(async () => {
      await held;
    });
  };
};
