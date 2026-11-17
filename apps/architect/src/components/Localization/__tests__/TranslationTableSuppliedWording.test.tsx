import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';

// Every protocol shows the interview's Back button, which Network Canvas
// words as "Back" in English.
const study = (
  interfaceText?: CurrentProtocol['interfaceText'],
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome' },
      title: { en: 'Hello' },
      items: [{ id: 'intro', type: 'text', content: { en: 'Read this' } }],
    },
  ],
  ...(interfaceText === undefined ? {} : { interfaceText }),
});

const renderTable = (protocol: CurrentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <TranslationTable onSaved={vi.fn()} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const save = async (user: ReturnType<typeof userEvent.setup>) => {
  const button = screen.getByRole('button', { name: 'Save' });
  await user.click(button);
  await waitFor(() => expect(button).toBeEnabled());
};

const heldInterfaceText = (store: ReturnType<typeof renderTable>['store']) =>
  getProtocol(store.getState())?.interfaceText;

describe('a text Network Canvas words, in the translation table', () => {
  it("shows Network Canvas's wording where the protocol has none, and stores a rewording", async () => {
    const { store, user } = renderTable(study());
    expect(heldInterfaceText(store)).toBeUndefined();

    const back = screen.getByDisplayValue('Back');
    await user.clear(back);
    await user.type(back, 'Previous');
    await save(user);

    expect(heldInterfaceText(store)).toEqual({
      navigation: { back: { en: 'Previous' } },
    });
  });

  it("goes back to Network Canvas's wording when its cell is left empty, and stores nothing for it", async () => {
    const { store, user } = renderTable(
      study({ navigation: { back: { en: 'Previous' } } }),
    );

    const back = screen.getByDisplayValue('Previous');
    await user.clear(back);
    await user.tab();

    expect(back).toHaveValue('Back');
    expect(back).not.toHaveAttribute('aria-invalid', 'true');

    await save(user);
    expect(heldInterfaceText(store)).toBeUndefined();
    expect(back).toHaveValue('Back');
  });

  // A save started from the keyboard checks the cells before the emptied
  // one is left, so nothing has put its wording back yet.
  it("saves an emptied cell that still has focus as Network Canvas's wording", async () => {
    const { store, user } = renderTable(
      study({ navigation: { back: { en: 'Previous' } } }),
    );

    const back = screen.getByDisplayValue('Previous');
    await user.clear(back);
    expect(back).toHaveFocus();
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    await waitFor(() => expect(heldInterfaceText(store)).toBeUndefined());

    expect(back).toHaveFocus();
    await waitFor(() => expect(back).toHaveValue('Back'));
    expect(back).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('stores nothing for a rewording typed back to exactly what Network Canvas says', async () => {
    const { store, user } = renderTable(
      study({ navigation: { back: { en: 'Previous' } } }),
    );

    const back = screen.getByDisplayValue('Previous');
    await user.clear(back);
    await user.type(back, 'Back');
    await save(user);

    expect(heldInterfaceText(store)).toBeUndefined();
  });

  it('still refuses to clear the only translation of a text Network Canvas does not word', async () => {
    const { user } = renderTable(study());

    const title = screen.getByDisplayValue('Hello');
    await user.clear(title);
    await user.tab();

    expect(title).toHaveValue('');
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'));
  });
});
