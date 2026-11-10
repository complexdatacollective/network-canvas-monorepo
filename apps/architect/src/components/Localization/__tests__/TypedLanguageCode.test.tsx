import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { type ReactNode, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';

import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import { describeLanguage } from '../languageChoices';
import LanguageList from '../LanguageList';
import { useLanguageActions } from '../useLanguageActions';

const { confirm, openDialog } = globalThis.__architectDialogMocks;

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
};

type OpenedDialog = {
  children: ReactNode;
  resolve: (values: Record<string, unknown> | false) => void;
};

// Shows what `openDialog` is asked to open, as a form that resolves it when
// submitted: the same contract the dialog provider keeps.
let showDialog: (dialog: OpenedDialog | undefined) => void = () => undefined;

const DialogHost = () => {
  const [dialog, setDialog] = useState<OpenedDialog>();
  showDialog = setDialog;
  if (!dialog) return null;
  return (
    <FormStoreProvider>
      <FormWithoutProvider
        onSubmit={(values) => {
          dialog.resolve(values);
          setDialog(undefined);
          return { success: true };
        }}
      >
        {dialog.children}
        <button type="submit">Submit the dialog</button>
      </FormWithoutProvider>
    </FormStoreProvider>
  );
};

const AddLanguagesButton = () => {
  const focusRef = useRef<HTMLButtonElement>(null);
  const { addLanguages } = useLanguageActions(focusRef);
  return (
    <button ref={focusRef} onClick={() => void addLanguages()}>
      Open the add languages dialog
    </button>
  );
};

const renderAddLanguages = (current: CurrentProtocol = protocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(current));
  // Declines the offer to also add a regional variant's language.
  confirm.mockResolvedValue(false);
  openDialog.mockImplementation(
    ({ children }: { children: ReactNode }) =>
      new Promise((resolve) => {
        act(() => {
          showDialog({
            children,
            resolve: (values) => resolve(values),
          });
        });
      }),
  );
  render(
    <Provider store={store}>
      <AddLanguagesButton />
      <DialogHost />
    </Provider>,
  );
  return { store };
};

const SEARCH = 'Search languages or type a language code';

const openList = async (user: UserEvent) => {
  await user.click(
    screen.getByRole('button', { name: 'Open the add languages dialog' }),
  );
  await user.click(await screen.findByRole('combobox', { name: 'Languages' }));
  return await screen.findByPlaceholderText(SEARCH);
};

// An option is named "<name> (<tag>)", then the language's own name.
const optionsFor = (tag: string) =>
  screen.queryAllByRole('option', {
    name: (name) => name.includes(`(${tag})`),
  });

// The single option for a tag: a second entry for the same language fails.
const theOption = async (tag: RegExp) => {
  const options = await screen.findAllByRole('option', { name: tag });
  expect(options).toHaveLength(1);
  const [option] = options;
  if (option === undefined) throw new Error(`No option for ${String(tag)}`);
  return option;
};

const submit = async (user: UserEvent) => {
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole('button', { name: 'Submit the dialog' }));
};

const languagesAfter = (
  store: ReturnType<typeof renderAddLanguages>['store'],
) => getProtocol(store.getState())?.localization.locales;

beforeEach(() => {
  showDialog = () => undefined;
});

describe('typing a language code into the list of languages to add', () => {
  it('offers a language that is not listed, and adds it to the protocol when chosen', async () => {
    const user = userEvent.setup();
    const { store } = renderAddLanguages();

    const search = await openList(user);
    // Hawaiian is not one of the listed languages.
    expect(optionsFor('haw')).toHaveLength(0);
    await user.type(search, 'haw');

    await user.click(await theOption(/Hawaiian \(haw\)/));
    await submit(user);

    await waitFor(() => expect(languagesAfter(store)).toEqual(['en', 'haw']));
  });

  it('offers the language beside the matches for the same text, without displacing them', async () => {
    const user = userEvent.setup();
    renderAddLanguages();

    const search = await openList(user);
    // "man" is found in the names of German, Manx and Romansh, and is also
    // the code of Mandingo.
    await user.type(search, 'man');

    const names = (await screen.findAllByRole('option')).map(
      (option) => option.textContent ?? '',
    );
    expect(names.filter((name) => /\(man\)/.test(name))).toHaveLength(1);
    for (const listed of ['German', 'Manx', 'Romansh']) {
      expect(names.some((name) => name.startsWith(listed))).toBe(true);
    }
    // Last: the matches keep their places.
    expect(names.at(-1)).toMatch(/^Mandingo \(man\)/);
  });

  it('stores a typed tag in its canonical form, once', async () => {
    const user = userEvent.setup();
    const { store } = renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'PT-ao');
    await user.click(await theOption(/\(pt-AO\)/));

    await user.clear(search);
    await user.type(search, 'zh-hant-tw');
    await user.click(await theOption(/\(zh-Hant-TW\)/));
    await submit(user);

    await waitFor(() =>
      expect(languagesAfter(store)).toEqual(['en', 'pt-AO', 'zh-Hant-TW']),
    );
  });

  it('shows a listed language once when its tag is typed in other letters', async () => {
    const user = userEvent.setup();
    const { store } = renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'ES-419');

    await user.click(await theOption(/\(es-419\)/));
    await submit(user);

    await waitFor(() =>
      expect(languagesAfter(store)).toEqual(['en', 'es-419']),
    );
  });

  it('adds no second entry for a tag that is already chosen or already the protocol’s', async () => {
    const user = userEvent.setup();
    renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'haw');
    await user.click(await theOption(/\(haw\)/));

    // Typed again, in other letters, the chosen language is still the one
    // entry, now selected.
    await user.clear(search);
    await user.type(search, 'HAW');
    expect(await theOption(/\(haw\)/)).toHaveAttribute('aria-selected', 'true');

    // English is the protocol's own language: not listed, and not offered
    // because it was typed.
    await user.clear(search);
    await user.type(search, 'EN');
    expect(optionsFor('en')).toHaveLength(0);
  });

  it.each(['xx', 'qqq', 'not a tag'])(
    'offers nothing for %j, and says nothing matches',
    async (typed) => {
      const user = userEvent.setup();
      renderAddLanguages();

      const search = await openList(user);
      await user.type(search, typed);

      expect(
        await screen.findByText('No language matches your search.'),
      ).toBeVisible();
      expect(screen.queryAllByRole('option')).toHaveLength(0);
    },
  );

  it('behaves as before while the text is only part of a code or a name', async () => {
    const user = userEvent.setup();
    renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'fre');

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(option).toHaveTextContent(/French/);
    expect(optionsFor('fre')).toHaveLength(0);
  });

  it('gives a typed right-to-left language its direction', async () => {
    const user = userEvent.setup();
    const { store } = renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'ckb');
    const kurdish = await theOption(/\(ckb\)/);

    // The language's own name is marked up with its language and direction.
    const ownName = kurdish.querySelector('[lang="ckb"]');
    expect(ownName).toHaveAttribute('dir', 'rtl');

    await user.clear(search);
    await user.type(search, 'ar-sa');
    const arabic = await theOption(/\(ar-SA\)/);
    expect(
      within(arabic).getByText(/./, { selector: '[lang]' }),
    ).toHaveAttribute('dir', 'rtl');
    expect(languagesAfter(store)).toEqual(['en']);
  });

  it('names a language chosen from a typed code in the closed list', async () => {
    const user = userEvent.setup();
    renderAddLanguages();

    const search = await openList(user);
    await user.type(search, 'chr');
    await user.click(await theOption(/\(chr\)/));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Languages' }),
      ).toHaveTextContent('Cherokee'),
    );
  });
});

// A language added by its code is not in the picker's list, so everything that
// lists a protocol's languages has to describe it from the tag alone.
describe('languages a protocol declares that the picker does not list', () => {
  it('describes each with its name, its own name and its direction', () => {
    expect(describeLanguage('haw', 'en')).toMatchObject({
      locale: 'haw',
      name: 'Hawaiian',
      direction: 'ltr',
    });
    expect(describeLanguage('ckb', 'en')).toMatchObject({
      locale: 'ckb',
      name: 'Central Kurdish',
      direction: 'rtl',
    });
    expect(describeLanguage('pt-AO', 'en').locale).toBe('pt-AO');
  });

  it('lists them on the Languages page by name, with the own name in its direction', () => {
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(
      setActiveProtocol({
        ...protocol,
        localization: { defaultLocale: 'en', locales: ['en', 'haw', 'ckb'] },
      }),
    );
    render(
      <Provider store={store}>
        <LanguageList />
      </Provider>,
    );

    expect(
      screen.getByRole('button', { name: 'Remove Hawaiian' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Central Kurdish' }),
    ).toBeInTheDocument();
    const ownName = document.querySelector('[lang="ckb"]');
    expect(ownName).toHaveAttribute('dir', 'rtl');
  });
});
