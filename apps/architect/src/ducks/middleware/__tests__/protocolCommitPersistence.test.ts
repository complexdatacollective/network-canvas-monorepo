import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  ProtocolValidationError,
} from '@codaco/protocol-validation';
import { takeProtocolValidationDialogEvents } from '~/utils/protocolValidationDialogQueue';

const validateProtocol = vi.fn();
const getStoredProtocol = vi.fn();
const putStoredProtocol = vi.fn();

vi.mock('@codaco/protocol-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    validateProtocol: (...args: unknown[]) => validateProtocol(...args),
  };
});

vi.mock('~/utils/protocolLibrary', () => ({
  getStoredProtocol: (...args: unknown[]) => getStoredProtocol(...args),
  putStoredProtocol: (...args: unknown[]) => putStoredProtocol(...args),
}));

vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    protocols: {},
    assets: {},
    transaction: (_mode: string, ...rest: unknown[]) =>
      (rest[rest.length - 1] as () => Promise<void>)(),
  },
}));

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}));

import activeProtocol, {
  setActiveProtocol,
  updateProtocolDescription,
} from '../../modules/activeProtocol';
import app, {
  setActiveProtocolId,
  setProtocolOpenElsewhere,
} from '../../modules/app';
import protocolValidation from '../../modules/protocolValidation';
import { protocolLibraryListenerMiddleware } from '../protocolLibraryListener';
import { protocolValidationListenerMiddleware } from '../protocolValidationListener';
import createTimeline from '../timeline';

const makeProtocol = (description?: string): CurrentProtocol =>
  ({
    name: 'Study',
    description,
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  }) as CurrentProtocol;

const reducer = combineReducers({
  app,
  activeProtocol: createTimeline(activeProtocol, {
    exclude: (action) =>
      action.type === 'activeProtocol/updateLastModified' ||
      !/^(activeProtocol|stages|codebook|assetManifest)\//.test(action.type),
  }),
  protocolValidation,
});

const makeStore = () =>
  configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false })
        .prepend(protocolValidationListenerMiddleware.middleware)
        .prepend(protocolLibraryListenerMiddleware.middleware),
  });

const waitForEffects = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 25);
  });

const seedValidProtocol = async (
  store: ReturnType<typeof makeStore>,
): Promise<void> => {
  validateProtocol.mockImplementation(async (protocol: CurrentProtocol) => ({
    success: true,
    data: protocol,
  }));
  store.dispatch(setActiveProtocolId('p1'));
  store.dispatch(setActiveProtocol(makeProtocol()));
  await waitForEffects();
  expect(validateProtocol).not.toHaveBeenCalled();
  validateProtocol.mockReset();
  putStoredProtocol.mockClear();
};

describe('validated protocol commit persistence', () => {
  beforeEach(() => {
    takeProtocolValidationDialogEvents();
    getStoredProtocol.mockReset().mockResolvedValue({ id: 'p1' });
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
    validateProtocol.mockReset();
  });

  afterEach(async () => {
    await waitForEffects();
    takeProtocolValidationDialogEvents();
    vi.clearAllMocks();
  });

  it('never writes a commit that fails protocol validation', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    validateProtocol.mockResolvedValue({
      success: false,
      error: new ProtocolValidationError([
        {
          code: 'custom',
          path: ['description'],
          message: 'Invalid committed description',
        },
      ]),
    });

    store.dispatch(
      updateProtocolDescription({ description: 'invalid committed value' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 625));

    expect(validateProtocol).toHaveBeenCalledTimes(1);
    expect(putStoredProtocol).not.toHaveBeenCalled();
  });

  it('writes a valid commit without waiting for a debounce timer', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    validateProtocol.mockImplementation(async (protocol: CurrentProtocol) => ({
      success: true,
      data: protocol,
    }));

    store.dispatch(
      updateProtocolDescription({ description: 'valid committed value' }),
    );
    await waitForEffects();

    expect(validateProtocol).toHaveBeenCalledTimes(1);
    expect(putStoredProtocol).toHaveBeenCalledTimes(1);
  });

  it('fails closed when protocol validation rejects unexpectedly', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    validateProtocol.mockRejectedValue(new Error('validator crashed'));

    store.dispatch(
      updateProtocolDescription({ description: 'unvalidated committed value' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 625));

    expect(validateProtocol).toHaveBeenCalledTimes(1);
    expect(putStoredProtocol).not.toHaveBeenCalled();
  });

  it('does not persist accepted commits from a read-only duplicate tab', async () => {
    const store = makeStore();
    await seedValidProtocol(store);
    store.dispatch(setProtocolOpenElsewhere(true));

    validateProtocol.mockImplementation(async (protocol: CurrentProtocol) => ({
      success: true,
      data: protocol,
    }));

    store.dispatch(
      updateProtocolDescription({ description: 'duplicate-tab edit' }),
    );
    await waitForEffects();

    expect(validateProtocol).toHaveBeenCalledTimes(1);
    expect(putStoredProtocol).not.toHaveBeenCalled();
  });

  it('uses trusted admission as the revert baseline for the first invalid commit', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    validateProtocol.mockResolvedValue({
      success: false,
      error: new ProtocolValidationError([
        {
          code: 'custom',
          path: ['description'],
          message: 'Invalid committed description',
        },
      ]),
    });

    store.dispatch(
      updateProtocolDescription({ description: 'invalid committed value' }),
    );
    await waitForEffects();

    const [event] = takeProtocolValidationDialogEvents();
    expect(event?.type).toBe('open');
    if (event?.type !== 'open') {
      throw new Error('expected invalid protocol recovery event');
    }

    event.onRevert();

    expect(
      store.getState().activeProtocol.present?.description,
    ).toBeUndefined();
  });

  it('validates every captured commit in FIFO order', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    let resolveFirst:
      | ((result: { success: true; data: CurrentProtocol }) => void)
      | undefined;
    validateProtocol
      .mockImplementationOnce(
        (_protocol: CurrentProtocol) =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(async (protocol: CurrentProtocol) => ({
        success: true,
        data: protocol,
      }));

    store.dispatch(updateProtocolDescription({ description: 'first' }));
    store.dispatch(updateProtocolDescription({ description: 'second' }));
    await Promise.resolve();

    expect(validateProtocol).toHaveBeenCalledTimes(1);
    expect(validateProtocol.mock.calls[0]?.[0]).toMatchObject({
      description: 'first',
    });

    resolveFirst?.({
      success: true,
      data: validateProtocol.mock.calls[0]?.[0] as CurrentProtocol,
    });
    await waitForEffects();

    expect(validateProtocol).toHaveBeenCalledTimes(2);
    expect(validateProtocol.mock.calls[1]?.[0]).toMatchObject({
      description: 'second',
    });
  });

  it('return-to-start clears the invalid buffer and active library id', async () => {
    const store = makeStore();
    await seedValidProtocol(store);
    validateProtocol.mockRejectedValue(new Error('validator crashed'));

    store.dispatch(
      updateProtocolDescription({ description: 'unvalidated committed value' }),
    );
    await waitForEffects();

    const [event] = takeProtocolValidationDialogEvents();
    expect(event?.type).toBe('open');
    if (event?.type !== 'open') {
      throw new Error('expected invalid protocol recovery event');
    }

    event.onReturnToStart();

    expect(store.getState().activeProtocol.present).toBeNull();
    expect(store.getState().activeProtocol.past).toEqual([]);
    expect(store.getState().activeProtocol.future).toEqual([]);
    expect(store.getState().app.activeProtocolId).toBeNull();
  });

  it('ignores stale validation failure after a different protocol opens', async () => {
    const store = makeStore();
    await seedValidProtocol(store);

    let resolveValidation:
      | ((result: { success: false; error: ProtocolValidationError }) => void)
      | undefined;
    validateProtocol.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveValidation = resolve;
        }),
    );

    store.dispatch(
      updateProtocolDescription({ description: 'pending first protocol edit' }),
    );
    await Promise.resolve();

    store.dispatch(setActiveProtocolId('p2'));
    store.dispatch(setActiveProtocol(makeProtocol('second protocol')));
    resolveValidation?.({
      success: false,
      error: new ProtocolValidationError([
        {
          code: 'custom',
          path: ['description'],
          message: 'Stale invalid commit',
        },
      ]),
    });
    await waitForEffects();

    expect(takeProtocolValidationDialogEvents()).toEqual([]);
    expect(store.getState().activeProtocol.present?.description).toBe(
      'second protocol',
    );
  });
});
