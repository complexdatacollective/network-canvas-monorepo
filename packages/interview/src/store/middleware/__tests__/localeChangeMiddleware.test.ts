import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialNetwork } from '../../../contract/network';
import type {
  ProtocolLocaleChange,
  ProtocolLocaleChangeHandler,
} from '../../../contract/types';
import sessionReducer, {
  recordLocale,
  setLocalePreference,
  updatePrompt,
} from '../../modules/session';
import { createLocaleChangeMiddleware } from '../localeChangeMiddleware';

function createTestStore(
  onProtocolLocaleChange: ProtocolLocaleChangeHandler,
  finishTime: string | null = null,
) {
  const localeChange = createLocaleChangeMiddleware({ onProtocolLocaleChange });
  const store = configureStore({
    reducer: { session: sessionReducer },
    preloadedState: {
      session: {
        id: 'interview-1',
        startTime: '2026-01-01T00:00:00.000Z',
        finishTime,
        exportTime: null,
        lastUpdated: '2026-01-01T00:00:00.000Z',
        network: createInitialNetwork(),
        localePreference: null,
        locale: null,
      },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(localeChange.middleware),
  });
  return {
    store,
    settled: localeChange.settled,
    markFinished: localeChange.markFinished,
  };
}

const drainMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('localeChangeMiddleware', () => {
  it('reports the locale first shown exactly once', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockResolvedValue(undefined);
    const { store, settled } = createTestStore(handler);

    store.dispatch(recordLocale('es'));
    store.dispatch(recordLocale('es'));
    await settled();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('interview-1', {
      locale: 'es',
      localePreference: null,
    });
  });

  it('reports a stated preference and the locale it selects in one call', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockResolvedValue(undefined);
    const { store, settled } = createTestStore(handler);

    store.dispatch(setLocalePreference('fr'));
    store.dispatch(setLocalePreference('fr'));
    await settled();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('interview-1', {
      locale: 'fr',
      localePreference: 'fr',
    });
  });

  it('ignores actions that leave the locale fields unchanged', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockResolvedValue(undefined);
    const { store, settled } = createTestStore(handler);

    store.dispatch(updatePrompt(2));
    await settled();

    expect(handler).not.toHaveBeenCalled();
    expect(store.getState().session.lastUpdated).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('makes one call at a time, in the order the changes happened', async () => {
    const calls: ProtocolLocaleChange[] = [];
    let finishFirst!: () => void;
    const handler = vi.fn<ProtocolLocaleChangeHandler>(
      async (_interviewId, change) => {
        calls.push(change);
        if (calls.length === 1) {
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        }
      },
    );
    const { store, settled } = createTestStore(handler);

    store.dispatch(recordLocale('es'));
    store.dispatch(setLocalePreference('fr'));
    await drainMicrotasks();

    expect(calls).toEqual([{ locale: 'es', localePreference: null }]);

    finishFirst();
    await settled();

    expect(calls).toEqual([
      { locale: 'es', localePreference: null },
      { locale: 'fr', localePreference: 'fr' },
    ]);
  });

  it('logs a failed call and still makes the next one', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { store, settled } = createTestStore(handler);

    store.dispatch(recordLocale('es'));
    await settled();
    store.dispatch(setLocalePreference('fr'));
    await settled();

    expect(console.error).toHaveBeenCalledWith(
      '❌ Error saving the interview language:',
      expect.objectContaining({ message: 'offline' }),
    );
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith('interview-1', {
      locale: 'fr',
      localePreference: 'fr',
    });
  });

  it('reports nothing for an interview opened finished', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockResolvedValue(undefined);
    const { store, settled } = createTestStore(
      handler,
      '2026-01-02T00:00:00.000Z',
    );

    store.dispatch(recordLocale('es'));
    store.dispatch(setLocalePreference('fr'));
    await settled();

    expect(store.getState().session.locale).toBe('fr');
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports nothing once the interview is finished', async () => {
    const handler = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockResolvedValue(undefined);
    const { store, settled, markFinished } = createTestStore(handler);

    store.dispatch(recordLocale('es'));
    markFinished();
    store.dispatch(recordLocale('fr'));
    await settled();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('interview-1', {
      locale: 'es',
      localePreference: null,
    });
  });
});
