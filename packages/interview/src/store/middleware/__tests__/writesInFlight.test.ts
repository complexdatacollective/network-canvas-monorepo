import { configureStore, createAction, type Reducer } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import {
  createEncryptionStore,
  NODE_TYPE,
} from '../../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { updateEgo, updateNode } from '../../modules/session';
import { createWritesInFlightMiddleware } from '../writesInFlight';

const patch = { set: { agrees: true }, unset: [] };

const unchanged: Reducer<number> = (state = 0) => state;

function makeStore(reducer = unchanged) {
  const { middleware, writesSettled, trackWrite } =
    createWritesInFlightMiddleware();
  const store = configureStore({
    reducer: { session: reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(middleware),
  });
  return { store, writesSettled, trackWrite };
}

// Whether `promise` has settled once everything already queued has run.
async function hasSettled(promise: Promise<unknown> | undefined) {
  let settled = false;
  void promise?.finally(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return settled;
}

describe('writes in flight', () => {
  it('reports no write under way before any has begun', () => {
    const { writesSettled } = makeStore();

    expect(writesSettled()).toBeUndefined();
  });

  it('settles once the write begun has been stored', async () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(updateEgo.pending('w1', patch));

    const settling = writesSettled();
    expect(await hasSettled(settling)).toBe(false);

    store.dispatch(updateEgo.fulfilled(patch, 'w1', patch));
    await expect(settling).resolves.toBe(true);
    expect(writesSettled()).toBeUndefined();
  });

  it('settles once the write begun has been refused, saying so', async () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(updateEgo.pending('w1', patch));
    const settling = writesSettled();

    store.dispatch(updateEgo.rejected(new Error('refused'), 'w1', patch));

    await expect(settling).resolves.toBe(false);
    expect(writesSettled()).toBeUndefined();
  });

  it('says a write was refused when another begun with it was stored', async () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(updateEgo.pending('w1', patch));
    store.dispatch(updateEgo.pending('w2', patch));
    const settling = writesSettled();

    store.dispatch(updateEgo.rejected(new Error('refused'), 'w1', patch));
    store.dispatch(updateEgo.fulfilled(patch, 'w2', patch));

    await expect(settling).resolves.toBe(false);
  });

  it('settles a write whose outcome the store throws on, as not stored', async () => {
    const throwsOnStore: Reducer<number> = (state = 0, action) => {
      if (updateEgo.fulfilled.match(action)) throw new Error('duplicate');
      return state;
    };
    const { store, writesSettled } = makeStore(throwsOnStore);
    store.dispatch(updateEgo.pending('w1', patch));
    const settling = writesSettled();

    expect(() =>
      store.dispatch(updateEgo.fulfilled(patch, 'w1', patch)),
    ).toThrow('duplicate');

    await expect(settling).resolves.toBe(false);
    expect(writesSettled()).toBeUndefined();
  });

  it('waits for every write begun, and not for one begun afterwards', async () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(updateEgo.pending('w1', patch));
    store.dispatch(updateEgo.pending('w2', patch));
    const settling = writesSettled();
    store.dispatch(updateEgo.pending('w3', patch));

    store.dispatch(updateEgo.fulfilled(patch, 'w1', patch));
    expect(await hasSettled(settling)).toBe(false);

    store.dispatch(updateEgo.fulfilled(patch, 'w2', patch));
    await expect(settling).resolves.toBe(true);
    expect(writesSettled()).toBeDefined();
  });

  it('counts a write waiting its turn as under way until it is stored', async () => {
    const { writesSettled, trackWrite } = makeStore();
    let settleWrite: (stored: boolean) => void = () => undefined;
    trackWrite(
      new Promise<boolean>((resolve) => {
        settleWrite = resolve;
      }),
    );

    const settling = writesSettled();
    expect(await hasSettled(settling)).toBe(false);

    settleWrite(true);
    await expect(settling).resolves.toBe(true);
    expect(writesSettled()).toBeUndefined();
  });

  it.each([
    ['is refused', () => Promise.resolve(false)],
    ['fails', () => Promise.reject(new Error('failed'))],
  ])(
    'says a write waiting its turn was not stored when it %s',
    async (_outcome, settle) => {
      const { writesSettled, trackWrite } = makeStore();
      trackWrite(settle());

      await expect(writesSettled()).resolves.toBe(false);
      expect(writesSettled()).toBeUndefined();
    },
  );

  it('ignores actions that are not session writes', () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(createAction<string>('other/pending')('w1'));

    expect(writesSettled()).toBeUndefined();
  });

  it('tracks a write dispatched through the interview store until it is stored', async () => {
    const interview = createEncryptionStore([
      {
        [entityPrimaryKeyProperty]: 'n1',
        type: NODE_TYPE,
        [entityAttributesProperty]: { age: 40 },
      },
    ]);

    const write = interview.dispatch(
      updateNode({
        nodeId: 'n1',
        attributePatch: { set: { age: 41 }, unset: [] },
        currentStep: 0,
      }),
    );
    const settling = interview.writesSettled();
    expect(settling).toBeDefined();

    await write;
    await expect(settling).resolves.toBe(true);
    expect(interview.writesSettled()).toBeUndefined();
  });
});
