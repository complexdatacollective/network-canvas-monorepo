import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import {
  createEdgeAsync,
  createTypeAsync,
  createVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
  assetManifest: {},
  stages: [],
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {},
      },
    },
    edge: {},
    ego: {},
  },
};

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  return store;
};

const codebookOf = (store: ReturnType<typeof makeStore>) =>
  getProtocol(store.getState())?.codebook;

// Participants never see a codebook name, so a codebook entry has only its
// name: nothing writes a label beside it.
describe('new codebook entries', () => {
  it('gives a new node type only its name', async () => {
    const store = makeStore();

    const { type } = await store
      .dispatch(
        createTypeAsync({
          entity: 'node',
          configuration: {
            name: 'Ami',
            color: 'node-color-seq-2',
            shape: { default: 'circle' },
          },
        }),
      )
      .unwrap();

    const created = codebookOf(store)?.node?.[type];
    expect(created?.name).toBe('Ami');
    expect(created).not.toHaveProperty('label');
  });

  it('gives a new edge type only its name', async () => {
    const store = makeStore();

    const { type } = await store
      .dispatch(createEdgeAsync({ name: 'Connaît' }))
      .unwrap();

    const created = codebookOf(store)?.edge?.[type];
    expect(created?.name).toBe('Connaît');
    expect(created).not.toHaveProperty('label');
  });

  it('gives a new variable only its name', async () => {
    const store = makeStore();

    const { variable } = await store
      .dispatch(
        createVariableAsync({
          entity: 'node',
          type: 'person',
          configuration: { name: 'âge {années}', type: 'number' },
        }),
      )
      .unwrap();

    const created = codebookOf(store)?.node?.person?.variables?.[variable];
    expect(created?.name).toBe('âge {années}');
    expect(created).not.toHaveProperty('label');
  });
});
