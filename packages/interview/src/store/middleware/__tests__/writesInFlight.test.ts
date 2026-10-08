import { configureStore, createAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  createEncryptionStore,
  makePlainPerson,
} from '../../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { updateEgo, updateNode } from '../../modules/session';
import { createWritesInFlightMiddleware } from '../writesInFlight';

const patch = { set: { agrees: true }, unset: [] };

function makeStore() {
  const { middleware, writesSettled } = createWritesInFlightMiddleware();
  const store = configureStore({
    reducer: { unchanged: (state = 0) => state },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(middleware),
  });
  return { store, writesSettled };
}

// Whether `promise` has settled once everything already queued has run.
async function hasSettled(promise: Promise<void> | undefined) {
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
    expect(await hasSettled(settling)).toBe(true);
    expect(writesSettled()).toBeUndefined();
  });

  it('settles once the write begun has been refused', async () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(updateEgo.pending('w1', patch));
    const settling = writesSettled();

    store.dispatch(updateEgo.rejected(new Error('refused'), 'w1', patch));

    expect(await hasSettled(settling)).toBe(true);
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
    expect(await hasSettled(settling)).toBe(true);
    expect(writesSettled()).toBeDefined();
  });

  it('ignores actions that are not session writes', () => {
    const { store, writesSettled } = makeStore();
    store.dispatch(createAction<string>('other/pending')('w1'));

    expect(writesSettled()).toBeUndefined();
  });

  it('tracks a write dispatched through the interview store until it is stored', async () => {
    const interview = createEncryptionStore([makePlainPerson('n1', 'Alice')]);

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
    expect(await hasSettled(settling)).toBe(true);
    expect(interview.writesSettled()).toBeUndefined();
  });
});
