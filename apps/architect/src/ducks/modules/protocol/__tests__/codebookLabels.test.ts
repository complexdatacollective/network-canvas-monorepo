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
        label: { en: 'Person', fr: 'Personne' },
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

describe('labels of new codebook entries', () => {
  it('labels a new node type with its name in the default language', async () => {
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

    expect(codebookOf(store)?.node?.[type]?.label).toEqual({ fr: 'Ami' });
  });

  it('keeps a label the caller supplies', async () => {
    const store = makeStore();

    const { type } = await store
      .dispatch(
        createTypeAsync({
          entity: 'node',
          configuration: {
            name: 'friend',
            label: { en: 'Friend', fr: 'Ami' },
            color: 'node-color-seq-2',
            shape: { default: 'circle' },
          },
        }),
      )
      .unwrap();

    expect(codebookOf(store)?.node?.[type]?.label).toEqual({
      en: 'Friend',
      fr: 'Ami',
    });
  });

  it('labels a new edge type with its name in the default language', async () => {
    const store = makeStore();

    const { type } = await store
      .dispatch(createEdgeAsync({ name: 'Connaît' }))
      .unwrap();

    expect(codebookOf(store)?.edge?.[type]?.label).toEqual({ fr: 'Connaît' });
  });

  it('labels a new variable with its name, as plain text', async () => {
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

    expect(codebookOf(store)?.node?.person?.variables?.[variable]?.label).toBe(
      'âge {années}',
    );
  });
});
