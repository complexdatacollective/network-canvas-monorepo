import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import TranslationTable from '../TranslationTable';

const protocolWith = (bindings: Record<string, unknown> | undefined) =>
  ({
    name: 'Study',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    assetManifest: {},
    codebook: {
      node: {},
      edge: {},
      ego: { variables: { firstName: { name: 'first_name', type: 'text' } } },
    },
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: { en: 'Welcome', fr: 'Bienvenue' },
        title: { en: '{ghost} welcome', fr: '{ghost} bienvenue' },
        ...(bindings === undefined ? {} : { dynamicValues: bindings }),
        items: [],
      },
    ],
  }) as unknown as CurrentProtocol;

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
  return { user: userEvent.setup() };
};

const titleCell = (language: string) =>
  screen.getByRole('button', { name: new RegExp(`Page heading ${language}$`) });

describe.each([
  ['a stage that binds no value', undefined],
  ['a stage that binds another value', { name: { path: 'ego.firstName' } }],
])('TranslationTable: a value %s does not bind', (_, bindings) => {
  it('keeps the unbound name visible as a pill when reading', () => {
    renderTable(protocolWith(bindings));

    const cell = titleCell('English').closest('td');
    expect(cell?.querySelector('[data-token="ghost"]')).not.toBeNull();
    expect(cell).toHaveTextContent('ghost');
  });

  it('keeps the unbound name visible as a pill when editing', async () => {
    const { user } = renderTable(protocolWith(bindings));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: /Page heading English$/,
    });
    await waitFor(() =>
      expect(editor.querySelector('[data-token="ghost"]')).not.toBeNull(),
    );
    expect(editor).toHaveTextContent('ghost');
  });

  it('refuses the text at its cell once the cell is left', async () => {
    const { user } = renderTable(protocolWith(bindings));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: /Page heading English$/,
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, ' there');
    await user.click(
      screen.getByRole('textbox', { name: /Stage name English$/ }),
    );

    await waitFor(() =>
      expect(titleCell('English')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getAllByText(/ghost/).length).toBeGreaterThan(0);
  });
});
