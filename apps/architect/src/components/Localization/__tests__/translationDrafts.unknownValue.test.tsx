import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getTranslationGroups } from '~/selectors/issues';

import {
  translationFieldName,
  useTranslationDraft,
} from '../translationDrafts';
import { dynamicValuesProtocol, FIRST_NAME } from './dynamicValuesProtocol';

const protocol = dynamicValuesProtocol({
  en: `Welcome{${FIRST_NAME}, select, missing {} other {, {${FIRST_NAME}}}}`,
  fr: 'Bienvenue',
});

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

describe('a translation that shows a value its place cannot show', () => {
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

  it('is accepted once it shows only what its place can show', async () => {
    const { result } = openDraft();

    act(() =>
      result.current.change(
        `Bonjour {${FIRST_NAME}, select, missing {} other {{${FIRST_NAME}}}}`,
      ),
    );
    act(() => result.current.leave());

    await waitFor(() => expect(result.current.changed).toBe(true));
    expect(result.current.error).toBeUndefined();
  });
});
