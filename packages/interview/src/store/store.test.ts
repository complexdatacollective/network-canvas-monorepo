import {
  type Action,
  type DevToolsEnhancerOptions,
  isAction,
  type Middleware,
} from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { createInitialNetwork } from '../contract/network';
import type { InterviewPayload } from '../contract/types';
import {
  encryptedVariables,
  NODE_TYPE,
  unlockWith,
} from '../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { addNode, updateNode } from './modules/session';
import { store } from './store';

// Stands in for the Redux DevTools extension, which the store looks for when
// Redux Toolkit is first loaded, so it is in place before any import.
const devTools = vi.hoisted(() => {
  const connections: DevToolsEnhancerOptions[] = [];
  Object.defineProperty(window, '__REDUX_DEVTOOLS_EXTENSION_COMPOSE__', {
    configurable: true,
    value: (options: DevToolsEnhancerOptions) => {
      connections.push(options);
      return (...enhancers: ReadonlyArray<(next: unknown) => unknown>) =>
        (createStore: unknown) =>
          enhancers.reduceRight(
            (next, enhancer) => enhancer(next),
            createStore,
          );
    },
  });
  return { connections };
});

const PASSPHRASE = 'correct horse battery';
const NAME = 'Alice Liddell';
const NEW_NAME = 'Alice Pleasance';
const ROSTER_NAME = 'Bob from the roster';

const payload: InterviewPayload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localePreference: null,
    locale: null,
    localeOptions: [getLocaleMetadata('en')],
    network: createInitialNetwork(),
  },
  protocol: {
    id: 'protocol-1',
    hash: 'hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Encryption protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    assets: [],
    codebook: {
      node: {
        [NODE_TYPE]: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: encryptedVariables,
        },
      },
    },
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        label: { en: 'Name generator' },
        subject: { entity: 'node', type: NODE_TYPE },
        form: {
          title: { en: 'Add a person' },
          fields: [
            {
              variable: asEntityAttributeReference('name'),
              prompt: { en: 'Name' },
            },
          ],
        },
        prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
      },
    ],
  },
};

function createInterview(isDevelopment: boolean) {
  const actions: Action[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    if (isAction(action)) actions.push(action);
    return next(action);
  };
  const interview = store(payload, {
    onSync: () => Promise.resolve(),
    onProtocolLocaleChange: () => Promise.resolve(),
    isDevelopment,
    extraMiddleware: [recordActions],
  });
  return { interview, actions };
}

/**
 * Writes an encrypted answer, changes it, and adds a person whose name is
 * stored without encryption, as a roster can.
 */
async function answer(interview: ReturnType<typeof store>) {
  await unlockWith(interview, PASSPHRASE);
  const { nodeId } = await interview
    .dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: NAME, age: 40 },
        useEncryption: true,
        currentStep: 0,
      }),
    )
    .unwrap();
  await interview
    .dispatch(
      updateNode({
        nodeId,
        attributePatch: { set: { name: NEW_NAME }, unset: [] },
        currentStep: 0,
      }),
    )
    .unwrap();
  await interview
    .dispatch(
      addNode({
        type: NODE_TYPE,
        attributeData: { name: ROSTER_NAME },
        currentStep: 0,
      }),
    )
    .unwrap();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the interview store', () => {
  it('connects to Redux DevTools only in a development build', () => {
    const before = devTools.connections.length;

    createInterview(false);
    expect(devTools.connections).toHaveLength(before);

    createInterview(true);
    expect(devTools.connections).toHaveLength(before + 1);
  });

  it('shows Redux DevTools no encrypted answer', async () => {
    const { interview, actions } = createInterview(true);
    const options = devTools.connections.at(-1);
    await answer(interview);

    const shown = JSON.stringify(
      actions.map((action) => options?.actionSanitizer?.(action, 0)),
    );
    expect(JSON.stringify(actions)).toContain(NAME);
    expect(shown).not.toContain(NAME);
    expect(shown).not.toContain(NEW_NAME);
    expect(shown).not.toContain(ROSTER_NAME);
    expect(shown).toContain('"age":40');

    const state = options?.stateSanitizer?.(interview.getState(), 0);
    expect(
      state?.session.network.nodes.map(
        (node) => node[entityAttributesProperty],
      ),
    ).toEqual([{ name: '[encrypted]', age: 40 }, { name: '[encrypted]' }]);
    expect(state?.protocol.codebook.node?.[NODE_TYPE]?.variables).toEqual(
      encryptedVariables,
    );
  });

  it('logs no encrypted answer', async () => {
    vi.stubEnv('MODE', 'development');
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { interview } = createInterview(true);

    await answer(interview);

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain('NETWORK/UPDATE_NODE');
    expect(logged).toContain('"age":40');
    expect(logged).not.toContain(NAME);
    expect(logged).not.toContain(NEW_NAME);
    expect(logged).not.toContain(ROSTER_NAME);
  });
});
