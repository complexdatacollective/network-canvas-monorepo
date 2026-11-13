// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import {
  configureStore,
  type Middleware,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Finding,
  ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  decideFinding,
  setShareReviews,
  startReview,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { rootReducer } from '~/ducks/modules/root';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import type { ReviewOutcome } from '~/protocolReview/reviewClient';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';
import {
  readReviewRecord,
  writeReviewRecord,
} from '~/protocolReview/reviewStore';

/**
 * Rule G: a review thunk never acts for a protocol that is no longer the
 * active one, and never mixes two protocols' data. Each test holds one of the
 * thunk's awaits open, switches protocols, then lets it finish.
 */

vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

const client = vi.hoisted(() => ({ requestReview: vi.fn() }));
vi.mock('~/protocolReview/reviewClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/protocolReview/reviewClient')>()),
  requestReview: client.requestReview,
}));

/** Awaits the test holds open: while `hold` is set, each call waits for release. */
const gates = vi.hoisted(() => {
  const make = () => ({ hold: false, waiting: [] as (() => void)[] });
  return { reads: make(), edits: make(), writes: make() };
});

const passGate = async (gate: { hold: boolean; waiting: (() => void)[] }) => {
  if (!gate.hold) return;
  await new Promise<void>((resolve) => {
    gate.waiting.push(resolve);
  });
};

const release = (gate: { hold: boolean; waiting: (() => void)[] }) => {
  gate.hold = false;
  for (const resume of gate.waiting.splice(0)) resume();
};

vi.mock('~/protocolReview/reviewStore', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/protocolReview/reviewStore')>();
  return {
    ...actual,
    readReviewRecord: async (protocolId: string) => {
      await passGate(gates.reads);
      return actual.readReviewRecord(protocolId);
    },
    writeReviewRecord: async (
      ...args: Parameters<typeof actual.writeReviewRecord>
    ) => {
      await passGate(gates.writes);
      return actual.writeReviewRecord(...args);
    },
  };
});

vi.mock('~/protocolReview/protocolFix', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/protocolReview/protocolFix')>();
  return {
    ...actual,
    editProtocol: async (
      ...args: Parameters<typeof actual.editProtocol>
    ): ReturnType<typeof actual.editProtocol> => {
      await passGate(gates.edits);
      return actual.editProtocol(...args);
    },
  };
});

/**
 * Every action dispatched to the store under test, in order, to see what a
 * stale continuation did. Each store logs to its own list: a test's leftover
 * continuations must not show up in the next test's log.
 */
let log: UnknownAction[] = [];

const makeStore = () => {
  const own: UnknownAction[] = [];
  const logger: Middleware = () => (next) => (action) => {
    own.push(action as UnknownAction);
    return next(action);
  };
  const created = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(logger),
  });
  keepProtocolReviewOnActiveProtocol(created);
  log = own;
  return created;
};

type Store = ReturnType<typeof makeStore>;

const TITLE: Finding = makeFinding('title', [
  op('set', '/stages/welcome/title/en', 'Welcome to our study'),
]);

const RESULT: ReviewResult = {
  reviewId: '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a',
  findings: [TITLE],
  quota: { limit: 5, remaining: 4, resetsAt: '2099-01-01T00:00:00.000Z' },
};

let counter = 0;

/** Switches the tab to `protocol` under a fresh id, without waiting for its review. */
const switchTo = (target: Store, protocol: CurrentProtocol) => {
  counter += 1;
  const id = `switch-${counter}`;
  target.dispatch(setProtocolLockState('owned'));
  target.dispatch(setActiveProtocolId(id));
  target.dispatch(setActiveProtocol(protocol));
  return id;
};

const open = async (target: Store, protocol = makeProtocol()) => {
  const id = switchTo(target, protocol);
  await vi.waitFor(() =>
    expect(target.getState().protocolReview.record?.protocolId).toBe(id),
  );
  return id;
};

const reviewed = async (target: Store) => {
  const id = await open(target);
  client.requestReview.mockResolvedValueOnce({
    kind: 'result',
    result: RESULT,
  } satisfies ReviewOutcome);
  await target.dispatch(startReview());
  await target.dispatch(checkFixAvailability());
  return id;
};

/** Protocol B: another protocol with its own study details. */
const otherProtocol = () => makeProtocol({ name: 'Another study' });

const protocolOf = (target: Store) => target.getState().activeProtocol.present;

let store: Store;

beforeEach(() => {
  store = makeStore();
  gates.reads.hold = false;
  gates.edits.hold = false;
  gates.writes.hold = false;
  client.requestReview.mockReset();
});

afterEach(() => {
  release(gates.reads);
  release(gates.edits);
  release(gates.writes);
  store.dispatch(cancelReview());
});

describe('rule G', () => {
  it('a review still saving cannot end the run of the protocol opened after it', async () => {
    await open(store);
    client.requestReview.mockResolvedValueOnce({
      kind: 'result',
      result: RESULT,
    } satisfies ReviewOutcome);
    gates.writes.hold = true;
    // A's answer has arrived and only its save is outstanding.
    const first = store.dispatch(startReview());
    await vi.waitFor(() =>
      expect(gates.writes.waiting.length).toBeGreaterThan(0),
    );
    const savingA = gates.writes.waiting.splice(0);
    gates.writes.hold = false;

    await open(store, otherProtocol());
    const { promise: answerB, resolve: answerBWith } =
      Promise.withResolvers<ReviewOutcome>();
    client.requestReview.mockReturnValueOnce(answerB);
    const second = store.dispatch(startReview());
    await vi.waitFor(() =>
      expect(store.getState().protocolReview.run.status).toBe('running'),
    );

    for (const resume of savingA) resume();
    await first;
    // B's review is still in flight, so its run must still say so.
    expect(store.getState().protocolReview.run.status).toBe('running');

    answerBWith({ kind: 'aborted' });
    await second;
  });

  it('startReview sends nothing when the protocol changes while its record is read', async () => {
    const a = switchTo(store, makeProtocol());
    gates.reads.hold = true;
    // The record of A is not in the slice yet, so the thunk reads it.
    const run = store.dispatch(startReview());
    await vi.waitFor(() =>
      expect(gates.reads.waiting.length).toBeGreaterThan(0),
    );
    const b = switchTo(store, otherProtocol());
    release(gates.reads);

    expect(await run).toEqual({ status: 'cancelled' });
    expect(client.requestReview).not.toHaveBeenCalled();
    expect((await readReviewRecord(a)).review).toBeNull();
    expect((await readReviewRecord(b)).review).toBeNull();
  });

  it('setShareReviews saves nothing when the protocol changes while its record is read', async () => {
    const a = switchTo(store, makeProtocol());
    gates.reads.hold = true;
    const choice = store.dispatch(setShareReviews(true));
    await vi.waitFor(() =>
      expect(gates.reads.waiting.length).toBeGreaterThan(0),
    );
    const b = switchTo(store, otherProtocol());
    release(gates.reads);
    await choice;

    expect((await readReviewRecord(a)).shareReviews).toBeNull();
    expect((await readReviewRecord(b)).shareReviews).toBeNull();
    expect(store.getState().protocolReview.record?.shareReviews).toBeNull();
  });

  it('decideFinding changes nothing when the protocol changes while the fix is checked', async () => {
    const a = await reviewed(store);
    gates.edits.hold = true;
    const decision = store.dispatch(decideFinding('title', 'fix'));
    await vi.waitFor(() =>
      expect(gates.edits.waiting.length).toBeGreaterThan(0),
    );
    switchTo(store, otherProtocol());
    // What the store holds for the other protocol: opening one drops the
    // wording Network Canvas supplies, so it is not the object passed in.
    const other = protocolOf(store);
    const afterSwitch = log.length;
    release(gates.edits);

    expect(await decision).toEqual({ ok: false, reason: 'no_review' });
    expect(protocolOf(store)).toBe(other);
    expect(
      log
        .slice(afterSwitch)
        .filter((action) =>
          [
            'protocolReview/fixChecked',
            'activeProtocol/updateProtocol',
          ].includes(action.type),
        ),
    ).toEqual([]);
    expect((await readReviewRecord(a)).review?.findings[0]?.decision).toBe(
      'undecided',
    );
  });

  it('undoFix changes nothing when the protocol changes while the undo is checked', async () => {
    const a = await reviewed(store);
    expect(await store.dispatch(decideFinding('title', 'fix'))).toEqual({
      ok: true,
    });
    gates.edits.hold = true;
    const undo = store.dispatch(undoFix('title'));
    await vi.waitFor(() =>
      expect(gates.edits.waiting.length).toBeGreaterThan(0),
    );
    switchTo(store, otherProtocol());
    // What the store holds for the other protocol: opening one drops the
    // wording Network Canvas supplies, so it is not the object passed in.
    const other = protocolOf(store);
    const afterSwitch = log.length;
    release(gates.edits);

    expect(await undo).toEqual({ ok: false, reason: 'no_review' });
    expect(protocolOf(store)).toBe(other);
    expect(
      log
        .slice(afterSwitch)
        .filter((action) =>
          [
            'protocolReview/fixChecked',
            'activeProtocol/updateProtocol',
          ].includes(action.type),
        ),
    ).toEqual([]);
    expect((await readReviewRecord(a)).review?.findings[0]?.decision).toBe(
      'fix',
    );
  });

  it('checkFixAvailability records no answer about a protocol no longer open', async () => {
    await reviewed(store);
    // An edit starts a check pass, held while it validates the fix.
    gates.edits.hold = true;
    store.dispatch(
      setActiveProtocol({ ...makeProtocol(), name: 'Edited so a check runs' }),
    );
    await vi.waitFor(() =>
      expect(gates.edits.waiting.length).toBeGreaterThan(0),
    );
    const stale = protocolOf(store);
    switchTo(store, otherProtocol());
    const afterSwitch = log.length;
    release(gates.edits);
    await store.dispatch(checkFixAvailability());

    const staleAnswers = log.slice(afterSwitch).filter((action) => {
      if (action.type !== 'protocolReview/fixChecked') return false;
      const { payload } = action as UnknownAction & {
        payload: { check: { protocol: unknown } };
      };
      return payload.check.protocol === stale;
    });
    expect(staleAnswers).toEqual([]);
  });

  it('syncProtocolReview installs no record for a protocol no longer open', async () => {
    gates.reads.hold = true;
    switchTo(store, makeProtocol());
    await vi.waitFor(() =>
      expect(gates.reads.waiting.length).toBeGreaterThan(0),
    );
    gates.reads.hold = false;
    const b = switchTo(store, otherProtocol());
    release(gates.reads);
    await vi.waitFor(() =>
      expect(store.getState().protocolReview.record?.protocolId).toBe(b),
    );
    expect(
      log.filter(
        (action) =>
          action.type === 'protocolReview/recordReplaced' &&
          (action as UnknownAction & { payload: { protocolId: string } })
            .payload.protocolId !== b,
      ),
    ).toEqual([]);
  });
});

/**
 * Only the tab that owns a protocol's saved copy starts a review of it or
 * saves anything about its review, and a tab that becomes the owner reads
 * what the previous owner saved.
 */
describe('tab ownership', () => {
  it('a tab that becomes the owner reads the sharing choice the other tab saved', async () => {
    const a = await open(store);
    await store.dispatch(setShareReviews(true));
    expect(store.getState().protocolReview.record?.shareReviews).toBe(true);

    store.dispatch(setProtocolLockState('open-elsewhere'));
    // The owning tab opts out, then closes.
    await writeReviewRecord({
      ...(await readReviewRecord(a)),
      shareReviews: false,
    });
    store.dispatch(setProtocolLockState('owned'));

    await vi.waitFor(() =>
      expect(store.getState().protocolReview.record?.shareReviews).toBe(false),
    );
  });

  it('a tab that does not own the protocol starts no review and saves no choice', async () => {
    const a = await open(store);
    store.dispatch(setProtocolLockState('open-elsewhere'));

    expect(await store.dispatch(startReview())).toEqual({
      status: 'cancelled',
    });
    expect(client.requestReview).not.toHaveBeenCalled();
    await store.dispatch(setShareReviews(true));
    expect((await readReviewRecord(a)).shareReviews).toBeNull();

    // The control: the same protocol, owned, does send its review.
    store.dispatch(setProtocolLockState('owned'));
    client.requestReview.mockResolvedValueOnce({
      kind: 'result',
      result: RESULT,
    } satisfies ReviewOutcome);
    expect(await store.dispatch(startReview())).toMatchObject({
      status: 'completed',
    });
    expect(client.requestReview).toHaveBeenCalledTimes(1);
  });

  it('a review whose answer arrives after another tab took the protocol is not reported as completed', async () => {
    const a = await open(store);
    const { promise: answer, resolve: answerWith } =
      Promise.withResolvers<ReviewOutcome>();
    client.requestReview.mockReturnValueOnce(answer);
    const run = store.dispatch(startReview());
    await vi.waitFor(() =>
      expect(store.getState().protocolReview.run.status).toBe('running'),
    );

    store.dispatch(setProtocolLockState('open-elsewhere'));
    answerWith({ kind: 'result', result: RESULT });

    // Nothing could be saved from here, so nothing completed.
    expect(await run).toEqual({ status: 'cancelled' });
    expect(store.getState().protocolReview.run.status).toBe('idle');
    expect(store.getState().protocolReview.record?.review).toBeNull();
    expect((await readReviewRecord(a)).review).toBeNull();
  });

  it('a review asked for one protocol does not start for the one opened since', async () => {
    const a = await open(store);
    const b = await open(store, otherProtocol());

    expect(await store.dispatch(startReview(a))).toEqual({
      status: 'cancelled',
    });
    expect(client.requestReview).not.toHaveBeenCalled();

    // The control: asked for the protocol that is open, it is sent.
    client.requestReview.mockResolvedValueOnce({
      kind: 'result',
      result: RESULT,
    } satisfies ReviewOutcome);
    expect(await store.dispatch(startReview(b))).toMatchObject({
      status: 'completed',
    });
  });
});
