import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resourceFailure, type ResourceResult } from '../../gateway.ts';
import { useResourceAttempt } from '../useResourceAttempt.ts';
import { deferred } from './asyncControls.ts';
import {
  batched,
  crossProduct,
  runNamedCase,
  shuffled,
} from './seededCases.ts';

/**
 * Every ordering of a claim's life against the thing that ends it, rather than
 * the handful anyone thought to write down.
 *
 * Three review rounds in a row landed in this hook, each on a different pairing
 * of "what the call answered" with "when the researcher moved on" — a
 * synchronous throw nobody was left to observe, an unmount landing between the
 * claim and its own dispatch, a superseded call answering with a failure. They
 * are the same defect written three ways: the claim and the call are two
 * separate clocks, and every combination of the two has to be safe, not the
 * ones a reader happened to picture. So the combinations are enumerated and
 * every one of them is checked against the invariants rather than against a
 * predicted outcome — a prediction is another thing a reader can get wrong in
 * exactly the way the code is wrong.
 *
 * ## The invariants
 *
 * 1. **A call's result reaches exactly one place, or none.** Never both the
 *    success and the abandonment: one selects the resource, the other deletes
 *    it at the host, and doing both loses the researcher's import.
 * 2. **The host is never called after the surface has gone.** A claim taken by
 *    a control that has since unmounted has nobody to hand anything to; sending
 *    the file anyway costs the researcher's bandwidth and leaves the host
 *    holding staging only an abandonment could ever drop.
 * 3. **A claim that was already dead never dispatches.** The claim is asked
 *    before the call is made, not after it answers.
 * 4. **The control never sits busy with nothing to show.** Once everything has
 *    settled it is either not busy, or genuinely still waiting on a host that
 *    has not answered.
 * 5. **A retry is offered exactly when repeating the call could still work,
 *    and repeats the identical call.**
 */

/** Fixed, so the shuffled order a failure names is the same order everywhere. */
const SEED = 0x1698_0007;

const OUTCOMES = [
  'ok',
  'failed-retryable',
  'failed-final',
  'throws',
  'never',
] as const;

/** Where, in the claim's own life, the researcher moves on. */
const INTERRUPTIONS = [
  'pre-begin',
  'mid-read',
  'post-read',
  'post-run',
] as const;

/** The two ways a claim stops being the one anybody is waiting for. */
const KINDS = ['supersede', 'unmount'] as const;

type AttemptCase = Readonly<{
  outcome: (typeof OUTCOMES)[number];
  interruptAt: (typeof INTERRUPTIONS)[number];
  kind: (typeof KINDS)[number];
  /** Whether the host answers before the interruption lands, or after it. */
  answersFirst: boolean;
  /** Whether the choice that supersedes this one makes a call of its own. */
  secondRuns: boolean;
  /** Whether the researcher then asks to try again. */
  retryAfter: boolean;
}>;

const CASES = shuffled(
  crossProduct({
    outcome: OUTCOMES,
    interruptAt: INTERRUPTIONS,
    kind: KINDS,
    answersFirst: [false, true],
    secondRuns: [false, true],
    retryAfter: [false, true],
  }),
  SEED,
);

/** Lets everything a settled promise starts run, inside `act`. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let hop = 0; hop < 6; hop += 1) await Promise.resolve();
  });
}

async function checkCase(subject: AttemptCase): Promise<void> {
  const answer = deferred<ResourceResult<string>>();
  const onSuccess = vi.fn<(data: string) => void>();
  const onAbandoned = vi.fn<(data: string) => void>();
  const secondSuccess = vi.fn<(data: string) => void>();
  let mounted = true;
  let callsAfterUnmount = 0;
  let calls = 0;

  const operation = (): Promise<ResourceResult<string>> => {
    calls += 1;
    if (!mounted) callsAfterUnmount += 1;
    if (subject.outcome === 'throws') throw new Error('the host adapter threw');
    if (subject.outcome === 'never') return new Promise<never>(() => undefined);
    return answer.promise;
  };
  const settleAnswer = (): void => {
    if (subject.outcome === 'ok') {
      answer.settle({ status: 'ok', data: 'first' });
      return;
    }
    if (subject.outcome === 'failed-retryable') {
      answer.settle(
        resourceFailure<string>('unavailable', 'not just now', {
          retryable: true,
        }),
      );
      return;
    }
    if (subject.outcome === 'failed-final') {
      answer.settle(
        resourceFailure<string>('invalid-content', 'that will never work', {
          retryable: false,
        }),
      );
    }
  };

  const { result, unmount } = renderHook(() => useResourceAttempt());

  const interrupt = async (): Promise<void> => {
    if (subject.kind === 'unmount') {
      mounted = false;
      unmount();
      return;
    }
    // A newer choice takes the next place in the order, exactly as the upload
    // control's own `begin()` does when a second file is picked.
    await act(async () => {
      const newer = result.current.begin();
      if (subject.secondRuns) {
        newer.run(
          () =>
            Promise.resolve<ResourceResult<string>>({
              status: 'ok',
              data: 'second',
            }),
          secondSuccess,
        );
      }
    });
    await flush();
  };

  if (subject.interruptAt === 'pre-begin') await interrupt();

  // An unmounted hook cannot be driven any further; the claim below would be
  // taken on a surface that is gone, which is the whole of what this row is.
  const claim = mounted ? result.current.begin() : undefined;
  const dispatched = (): boolean => calls > 0;

  if (subject.interruptAt === 'mid-read') await interrupt();
  // The file finishes reading. Whether the claim is still the current one is
  // asked here, before anything is sent, exactly as the control asks it.
  if (subject.interruptAt === 'post-read') await interrupt();

  const claimLiveAtDispatch = claim?.current() ?? false;
  if (claim !== undefined) {
    await act(async () => {
      claim.run(operation, onSuccess, onAbandoned);
    });
    if (subject.answersFirst) {
      settleAnswer();
      await flush();
    }
    if (subject.interruptAt === 'post-run') await interrupt();
    if (!subject.answersFirst) {
      settleAnswer();
      await flush();
    }
  }

  // 3. A claim that was dead before its call never dispatches.
  if (!claimLiveAtDispatch) expect(calls).toBe(0);
  // 2. Nothing reaches the host once the surface has gone.
  expect(callsAfterUnmount).toBe(0);
  // 1. One destination at most, and never both.
  const delivered = onSuccess.mock.calls.length + onAbandoned.mock.calls.length;
  expect(delivered).toBeLessThanOrEqual(1);
  expect(
    onSuccess.mock.calls.length === 0 || onAbandoned.mock.calls.length === 0,
  ).toBe(true);
  // A successful call that was dispatched and answered always reaches one of
  // them: selecting the resource, or dropping it at the host. Dropping it
  // silently would leave the host holding staging nothing can name.
  if (subject.outcome === 'ok' && dispatched()) expect(delivered).toBe(1);

  if (mounted) {
    const attempt = result.current;
    // 4. Busy only while the host really has not answered.
    const outstanding = subject.outcome === 'never' && dispatched();
    if (!outstanding) expect(attempt.busy).toBe(false);
    // 5. A retry is offered exactly when repeating the call could still work.
    expect(attempt.retry !== undefined).toBe(
      attempt.failure?.retryable === true,
    );
    if (attempt.failure !== undefined) expect(attempt.busy).toBe(false);

    if (subject.retryAfter && attempt.retry !== undefined) {
      const before = calls;
      const retry = attempt.retry;
      await act(async () => {
        retry();
      });
      await flush();
      // The identical call, once: a retry that minted a new request would
      // stage the researcher's file a second time.
      expect(calls).toBe(before + 1);
      expect(
        onSuccess.mock.calls.length + onAbandoned.mock.calls.length,
      ).toBeLessThanOrEqual(1);
      expect(callsAfterUnmount).toBe(0);
    }
  }

  if (subject.secondRuns && subject.kind === 'supersede' && mounted) {
    // Checked so a row cannot pass by superseding nothing at all.
    expect(secondSuccess.mock.calls.map(([data]) => data)).toEqual(['second']);
    // The newer choice is the one that decides — except where it was made
    // before this claim existed, or after this claim's own answer had already
    // been taken, neither of which is a supersession of anything in flight.
    const supersededInFlight =
      subject.interruptAt !== 'pre-begin' &&
      !(subject.interruptAt === 'post-run' && subject.answersFirst);
    if (supersededInFlight) expect(onSuccess).not.toHaveBeenCalled();
  }

  if (mounted) unmount();
}

describe(`the resource attempt hook, over ${CASES.length} orderings (seed ${SEED})`, () => {
  it.each(batched(CASES, 10))(
    'holds its invariants for batch $index',
    async ({ cases }) => {
      for (const subject of cases) await runNamedCase(subject, checkCase);
    },
  );
});
