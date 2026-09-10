import { useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

/**
 * The request id one write carries, kept for as long as its answer is
 * uncertain.
 *
 * A host makes a write once for its `requestId` and answers a retry carrying
 * the same one with what that attempt wrote. That is the whole of a retry, and
 * it only works if the client asks again with the SAME id: a transport that
 * drops after the host committed leaves this client unable to tell a write
 * that happened from one that did not, and an oRPC link rejects the calls that
 * were in flight rather than resending them, so what the researcher does next
 * — pressing Save again, because that is what the refusal told them to do — is
 * the retry. A fresh id there is a second write: for a `create`, a second
 * stage or a second entity type in the codebook, and the editor is told about
 * only one of them.
 *
 * Keyed by the thing the researcher asked for, so a retry is told apart from a
 * NEW ask. Two writes in a row that happen to be identical are still one ask
 * asked twice as far as the host is concerned — which is what an idempotency
 * key means — while a save of different work must never be answered with the
 * revision the earlier one wrote.
 */
export type KeptRequestId = Readonly<{
  /**
   * The id this attempt at `ask` carries: the one the last attempt at the same
   * ask carried while that one's answer is still uncertain, and a new one
   * otherwise.
   *
   * `ask` is whatever identifies the change the researcher asked for — a
   * content hash of the document about to be written, and whatever else the
   * caller varies beside it.
   */
  forAsk(ask: string): string;
  /**
   * The host answered this id — with the write it made, or with a refusal it
   * decided on — so the next attempt is a new operation. Anything else is an
   * answer that may or may not exist, and the id is kept for the retry.
   */
  settled(requestId: string): void;
  /** Whatever id is being kept is for work this caller has moved on from. */
  forget(): void;
}>;

/**
 * One kept id per caller.
 *
 * Held in a ref rather than in state: nothing renders differently for it, and
 * a second attempt made in the same turn as the first has to see what the
 * first left behind.
 */
export function useKeptRequestId(): KeptRequestId {
  const kept = useRef<Readonly<{ requestId: string; ask: string }> | undefined>(
    undefined,
  );

  return useMemo(
    () => ({
      forAsk: (ask) => {
        const requestId =
          kept.current?.ask === ask ? kept.current.requestId : uuid();
        kept.current = { requestId, ask };
        return requestId;
      },
      settled: (requestId) => {
        // Only if it is still the one being kept: a later ask has already
        // taken the slot, and clearing it would mint a fresh id for that ask's
        // own retry.
        if (kept.current?.requestId === requestId) kept.current = undefined;
      },
      forget: () => {
        kept.current = undefined;
      },
    }),
    [],
  );
}
