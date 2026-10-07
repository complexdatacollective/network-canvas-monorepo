import {
  type Action,
  configureStore,
  isAction,
  type Middleware,
} from '@reduxjs/toolkit';
import { createLogger } from 'redux-logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEncryptionStore,
  NODE_TYPE,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { addNode } from '../modules/session';
import { setPassphrase } from '../modules/ui';

vi.mock('@reduxjs/toolkit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@reduxjs/toolkit')>();
  return { ...actual, configureStore: vi.fn(actual.configureStore) };
});

vi.mock('redux-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('redux-logger')>();
  return { ...actual, createLogger: vi.fn(actual.createLogger) };
});

const PASSPHRASE = 'correct-horse-battery';

function getDevToolsOptions() {
  const [options] = vi.mocked(configureStore).mock.lastCall ?? [];
  return options?.devTools;
}

function getLoggerOptions() {
  const [options] = vi.mocked(createLogger).mock.lastCall ?? [];
  return options;
}

/**
 * A development store, the actions a participant's typing produces when they
 * add a person with a protected name, and the state that follows.
 */
async function addProtectedPerson() {
  const actions: Action[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    if (isAction(action)) {
      actions.push(action);
    }
    return next(action);
  };
  const store = createEncryptionStore([], undefined, undefined, {
    isDevelopment: true,
    extraMiddleware: [recordActions],
  });

  store.dispatch(setPassphrase(PASSPHRASE));
  const result = await store.dispatch(
    addNode({
      type: NODE_TYPE,
      attributeData: { name: 'Bob', age: 41 },
      useEncryption: true,
      currentStep: 0,
    }),
  );
  if (!addNode.fulfilled.match(result)) {
    throw new Error('expected the protected person to be added');
  }

  const pending = actions.find((action) => addNode.pending.match(action));
  if (!pending) {
    throw new Error('expected the add to dispatch a pending action');
  }
  return { store, actions, pending };
}

describe('dev tooling', () => {
  beforeEach(() => {
    vi.mocked(configureStore).mockClear();
    vi.mocked(createLogger).mockClear();
  });

  it('keeps Redux DevTools and the console logger off unless the host is in development', () => {
    createEncryptionStore([]);

    expect(getDevToolsOptions()).toBe(false);
    expect(createLogger).not.toHaveBeenCalled();
  });

  it('shows Redux DevTools neither the passphrase nor the answers it protects', async () => {
    const { store, actions, pending } = await addProtectedPerson();
    const devTools = getDevToolsOptions();
    if (typeof devTools !== 'object') {
      throw new Error('expected Redux DevTools to be configured');
    }
    const { actionSanitizer, stateSanitizer } = devTools;
    if (!actionSanitizer || !stateSanitizer) {
      throw new Error('expected Redux DevTools to sanitize what it shows');
    }

    const shown = JSON.stringify([
      actions.map((action, index) => actionSanitizer(action, index)),
      stateSanitizer(store.getState(), 0),
    ]);
    expect(shown).not.toContain(PASSPHRASE);
    expect(shown).not.toContain('Bob');
    expect(actionSanitizer(pending, 0)).toMatchObject({
      meta: { arg: { attributeData: { name: '[redacted]', age: 41 } } },
    });
    expect(store.getState().ui.passphrase).toBe(PASSPHRASE);
  });

  it('logs neither the passphrase nor the answers it protects to the console', async () => {
    const { store, actions, pending } = await addProtectedPerson();
    const logger = getLoggerOptions();
    const { actionTransformer, stateTransformer } = logger ?? {};
    if (!actionTransformer || !stateTransformer) {
      throw new Error('expected the console logger to sanitize what it logs');
    }

    const logged = JSON.stringify([
      actions.map((action) => actionTransformer(action)),
      stateTransformer(store.getState()),
    ]);
    expect(logged).not.toContain(PASSPHRASE);
    expect(logged).not.toContain('Bob');
    expect(actionTransformer(pending)).toMatchObject({
      meta: { arg: { attributeData: { name: '[redacted]', age: 41 } } },
    });
  });
});
