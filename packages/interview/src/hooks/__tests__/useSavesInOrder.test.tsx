import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createWritesInFlightMiddleware } from '../../store/middleware/writesInFlight';
import { WritesInFlightProvider } from '../../store/WritesInFlightContext';
import useSavesInOrder from '../useSavesInOrder';

const isStored = (stored: boolean) => stored;

function renderSaves() {
  const { writesSettled, trackWrite } = createWritesInFlightMiddleware();
  const started: string[] = [];
  const finish: ((stored: boolean) => void)[] = [];
  const save = (answer: string) => {
    started.push(answer);
    return new Promise<boolean>((resolve) => {
      finish.push(resolve);
    });
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WritesInFlightProvider
      writesSettled={writesSettled}
      trackWrite={trackWrite}
    >
      {children}
    </WritesInFlightProvider>
  );
  const { result } = renderHook(() => useSavesInOrder(save, isStored), {
    wrapper,
  });
  return { saveInOrder: result.current, writesSettled, started, finish };
}

// Lets everything already queued run.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Whether `promise` has settled once everything already queued has run.
async function hasSettled(promise: Promise<unknown> | undefined) {
  let settled = false;
  void promise?.finally(() => {
    settled = true;
  });
  await tick();
  return settled;
}

describe('useSavesInOrder', () => {
  it('starts each save once the one before it has settled', async () => {
    const { saveInOrder, started, finish } = renderSaves();

    void saveInOrder('first');
    void saveInOrder('second');
    await tick();
    expect(started).toEqual(['first']);

    finish[0]?.(true);
    await tick();
    expect(started).toEqual(['first', 'second']);
  });

  it('counts a save waiting its turn as under way until it is stored', async () => {
    const { saveInOrder, writesSettled, finish } = renderSaves();

    void saveInOrder('first');
    void saveInOrder('second');
    const settling = writesSettled();

    await tick();
    finish[0]?.(true);
    expect(await hasSettled(settling)).toBe(false);

    finish[1]?.(true);
    await expect(settling).resolves.toBe(true);
  });

  it('counts a save its result says was not stored as refused', async () => {
    const { saveInOrder, writesSettled, finish } = renderSaves();

    void saveInOrder('first');
    const settling = writesSettled();
    await tick();
    finish[0]?.(false);

    await expect(settling).resolves.toBe(false);
  });
});
