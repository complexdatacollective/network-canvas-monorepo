import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { testVariableId } from '@codaco/protocol-builder/testing/testId';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getTranslationGroups } from '~/selectors/issues';

import {
  translationFieldName,
  useTranslationDraft,
} from '../translationDrafts';
import { dynamicValuesProtocol } from './dynamicValuesProtocol';

const protocol = dynamicValuesProtocol(
  { en: 'Welcome', fr: 'Bienvenue' },
  { name: { path: `ego.${testVariableId('firstName')}` } },
);

const openDraft = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  const row = getTranslationGroups(store.getState())
    .flatMap((group) => group.rows)
    .find(({ path }) => path.join('.') === 'stages.0.content');
  if (row === undefined) {
    throw new Error('The content is not a translation row.');
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <FormStoreProvider>{children}</FormStoreProvider>
    </Provider>
  );
  const hook = renderHook(() => useTranslationDraft({ row, locale: 'fr' }), {
    wrapper,
  });
  return { row, ...hook };
};

describe('a translation that shows a value the stage does not bind', () => {
  it('is refused at the cell it was written in, once the cell is left', async () => {
    const { row, result } = openDraft();

    act(() => result.current.change('Bonjour {ghost}'));
    expect(result.current.error).toBeUndefined();
    act(() => result.current.leave());

    // The error is held by the cell's own field, named by the text's path and
    // the language, which is what the table takes the researcher to.
    await waitFor(() => expect(result.current.error).toMatch(/ghost/));
    expect(result.current.name).toBe(translationFieldName(row.path, 'fr'));
  });

  it('is accepted once it shows only what the stage binds', async () => {
    const { result } = openDraft();

    act(() =>
      result.current.change(
        'Bonjour {name, select, missing {} other {{name}}}',
      ),
    );
    act(() => result.current.leave());

    await waitFor(() => expect(result.current.changed).toBe(true));
    expect(result.current.error).toBeUndefined();
  });
});
