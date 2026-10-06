import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import LanguageList from '../LanguageList';

// French has the only copy of the welcome title, so it cannot be removed, and
// German is missing both texts.
const trilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      title: { fr: 'Bonjour' },
      items: [],
    },
  ],
};

const monolingual: CurrentProtocol = {
  ...trilingual,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome' },
      title: { en: 'Hello' },
      items: [],
    },
  ],
};

const renderLanguageList = (
  protocol: CurrentProtocol = trilingual,
  onShowMissing = vi.fn(),
) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  render(
    <Provider store={store}>
      <LanguageList onShowMissing={onShowMissing} />
    </Provider>,
  );
  return { store, onShowMissing };
};

const rowOf = (language: string) => {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(language, { exact: true }));
  if (!row) throw new Error(`No row for ${language}`);
  return row;
};

describe('LanguageList', () => {
  it('moves a language with the arrow keys on its handle and announces where it went', () => {
    const { store } = renderLanguageList();

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder French, position 2 of 3' }),
      { key: 'ArrowUp' },
    );

    expect(getProtocol(store.getState())?.localization.locales).toEqual([
      'fr',
      'en',
      'de',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'French moved to position 1 of 3.',
    );
    expect(
      screen.getByRole('button', { name: 'Reorder French, position 1 of 3' }),
    ).toBeInTheDocument();
  });

  it('offers no handle when the protocol has one language', () => {
    renderLanguageList(monolingual);

    expect(
      screen.queryByRole('button', { name: /^Reorder/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the default language’s Remove focusable and says why it is unavailable', async () => {
    renderLanguageList();
    const reason =
      'To remove the default language, make another language the default first.';

    const remove = within(rowOf('English')).getByRole('button', {
      name: 'Remove',
    });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).not.toBeDisabled();
    expect(remove).toHaveAccessibleDescription(reason);

    await userEvent.hover(remove);
    expect(
      await screen.findByRole('tooltip', { hidden: true }),
    ).toHaveTextContent(reason);

    remove.focus();
    expect(remove).toHaveFocus();
    await userEvent.click(remove);
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
  });

  it('says why a language holding the only copy of a text cannot be removed', () => {
    renderLanguageList();

    const remove = within(rowOf('French')).getByRole('button', {
      name: 'Remove',
    });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(
      '1 text exists only in French. Translate it into another language before removing French.',
    );
  });

  it('leaves Remove available for a language that can be removed', () => {
    renderLanguageList();

    const remove = within(rowOf('German')).getByRole('button', {
      name: 'Remove',
    });
    expect(remove).not.toHaveAttribute('aria-disabled');
    expect(remove).not.toHaveAccessibleDescription();
  });

  it('asks for the missing translations of a language', () => {
    const { onShowMissing } = renderLanguageList();

    fireEvent.click(
      within(rowOf('German')).getByRole('button', {
        name: 'Show 2 missing translations',
      }),
    );

    expect(onShowMissing).toHaveBeenCalledWith('de');
  });
});
