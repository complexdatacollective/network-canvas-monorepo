import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol, Variable } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import {
  createTypeAsync,
  createVariableAsync,
  updateTypeAsync,
  updateVariableByUUID,
} from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

const PERSON = 'person_node_type';

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    protocolActions.setActiveProtocol(
      structuredClone(developmentProtocol) as unknown as CurrentProtocol,
    ),
  );

  return store;
};

type Store = ReturnType<typeof makeStore>;

const personVariables = (store: Store) =>
  getProtocol(store.getState())?.codebook.node?.[PERSON]?.variables ?? {};

const createPersonVariable = (store: Store, configuration: Partial<Variable>) =>
  store
    .dispatch(
      createVariableAsync({ entity: 'node', type: PERSON, configuration }),
    )
    .unwrap();

const text = (name: string): Partial<Variable> => ({ name, type: 'text' });

describe('createVariableAsync names', () => {
  it.each([
    ['amigo cercano', 'amigo cercano'],
    ['Collègue', 'Collègue'],
    ['友人', '友人'],
    ['Nickname (old)', 'Nickname (old)'],
    // Saved as the composed, trimmed text the schema requires.
    ['  Colle\u0300gue ', 'Collègue'],
  ])('saves %j as %j', async (typed, saved) => {
    const store = makeStore();

    const { variable } = await createPersonVariable(store, text(typed));

    expect(personVariables(store)[variable]?.name).toBe(saved);
  });

  it('refuses a name with a control character', async () => {
    const store = makeStore();
    const before = Object.keys(personVariables(store));

    await expect(
      createPersonVariable(store, text('bad\tname')),
    ).rejects.toThrow(/control characters/);
    await expect(
      createPersonVariable(store, text('bad\u0000name')),
    ).rejects.toThrow(/control characters/);

    expect(Object.keys(personVariables(store))).toEqual(before);
  });

  it('treats a name of only spaces as no name', async () => {
    const store = makeStore();

    await expect(createPersonVariable(store, text('   '))).rejects.toThrow(
      /name/i,
    );
  });

  it('refuses a name another attribute has, ignoring case and composition', async () => {
    const store = makeStore();
    await createPersonVariable(store, text('Collègue'));

    await expect(
      createPersonVariable(store, text('COLLE\u0300GUE')),
    ).rejects.toThrow(/already/i);
  });

  it('saves categorical option values trimmed and composed', async () => {
    const store = makeStore();

    const { variable } = await createPersonVariable(store, {
      name: 'closeness',
      type: 'categorical',
      options: [
        { label: 'Close', value: '  amigo cercano ' },
        { label: 'Colleague', value: 'Colle\u0300gue' },
        { label: 'One', value: 1 },
      ],
    });

    const saved = personVariables(store)[variable];
    expect(saved && 'options' in saved ? saved.options : undefined).toEqual([
      { label: 'Close', value: 'amigo cercano' },
      { label: 'Colleague', value: 'Collègue' },
      { label: 'One', value: 1 },
    ]);
  });
});

describe('renaming an attribute', () => {
  it('saves the new name trimmed and composed', async () => {
    const store = makeStore();
    const { variable } = await createPersonVariable(store, text('before'));

    await store
      .dispatch(updateVariableByUUID(variable, { name: ' 友人 ' }))
      .unwrap();
    expect(personVariables(store)[variable]?.name).toBe('友人');

    await store
      .dispatch(updateVariableByUUID(variable, { name: 'Colle\u0300gue' }))
      .unwrap();
    expect(personVariables(store)[variable]?.name).toBe('Collègue');
  });
});

describe('type names', () => {
  const typeNames = (store: Store) =>
    Object.values(getProtocol(store.getState())?.codebook.node ?? {}).map(
      ({ name }) => name,
    );

  it('saves a new type name in any script, trimmed and composed', async () => {
    const store = makeStore();

    await store
      .dispatch(
        createTypeAsync({
          entity: 'node',
          configuration: { name: ' amigo cercano ' },
        }),
      )
      .unwrap();
    await store
      .dispatch(
        createTypeAsync({
          entity: 'node',
          configuration: { name: 'Colle\u0300gue' },
        }),
      )
      .unwrap();
    await store
      .dispatch(
        createTypeAsync({ entity: 'node', configuration: { name: '友人' } }),
      )
      .unwrap();

    expect(typeNames(store)).toEqual(
      expect.arrayContaining(['amigo cercano', 'Collègue', '友人']),
    );
  });

  it('saves a renamed type trimmed and composed', async () => {
    const store = makeStore();

    await store
      .dispatch(
        updateTypeAsync({
          entity: 'node',
          type: PERSON,
          configuration: { name: ' Colle\u0300gue ' },
        }),
      )
      .unwrap();

    expect(getProtocol(store.getState())?.codebook.node?.[PERSON]?.name).toBe(
      'Collègue',
    );
  });
});
