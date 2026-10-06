import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import {
  removeProtocolLocale,
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import MissingTranslations from '../MissingTranslations';

// French is missing the welcome title, both welcome texts, the thanks title
// and the person type's label; Spanish is missing only the thanks title.
const trilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'es'] },
  assetManifest: {},
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: { en: 'People', es: 'Personas' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue', es: 'Bienvenida' },
      title: { en: 'Hello', es: 'Hola' },
      items: [
        {
          id: 'intro',
          type: 'text',
          content: { en: 'Read **this** first', es: 'Lea esto primero' },
        },
        {
          id: 'more',
          type: 'text',
          content: { en: 'Then that', es: 'Luego eso' },
        },
      ],
    },
    {
      id: 'thanks',
      type: 'Information',
      label: { en: 'Thanks', fr: 'Merci', es: 'Gracias' },
      title: { en: 'Thank you' },
      items: [],
    },
  ],
};

const renderMissingTranslations = (protocol: CurrentProtocol = trilingual) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  const onLanguageChange = vi.fn<(locale: LocaleTag) => void>();
  const headingRef = createRef<HTMLElement>();

  const Page = () => {
    const [language, setLanguage] = useState<LocaleTag | null>(null);
    return (
      <MissingTranslations
        language={language}
        onLanguageChange={(locale) => {
          onLanguageChange(locale);
          setLanguage(locale);
        }}
        headingRef={headingRef}
      />
    );
  };

  render(
    <Provider store={store}>
      <Page />
    </Provider>,
  );
  return { store, onLanguageChange, headingRef, user: userEvent.setup() };
};

type Rendered = ReturnType<typeof renderMissingTranslations>;

const textButton = (name: string) => screen.getByRole('button', { name });

const headingLevel = (element: HTMLElement) => Number(element.tagName.slice(1));

const openText = async (user: Rendered['user'], name: string) => {
  await user.click(textButton(name));
  return screen.findByRole('dialog');
};

const stageTitle = (store: Rendered['store'], index: number) => {
  const stage = getProtocol(store.getState())?.stages[index];
  return stage && 'title' in stage ? stage.title : undefined;
};

const participantView = (dialog: HTMLElement) =>
  within(
    within(dialog).getByRole('region', { name: 'What participants see' }),
  ).getAllByRole('listitem');

const languageEntry = (dialog: HTMLElement, language: string) => {
  const entry = participantView(dialog).find(
    (item) => within(item).queryByText(language) !== null,
  );
  if (!entry) throw new Error(`No entry for ${language}`);
  return entry;
};

const chooseEditingLanguage = async (user: Rendered['user'], name: RegExp) => {
  await user.click(screen.getByRole('button', { name: /Editing language/ }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
};

describe('MissingTranslations', () => {
  it('lists texts by category, then by the stage or type that holds them', () => {
    renderMissingTranslations();

    const title = screen.getByRole('heading', { name: 'Missing translations' });
    const stages = screen.getByRole('heading', { name: 'Stages' });
    const codebook = screen.getByRole('heading', { name: 'Codebook' });
    const welcome = screen.getByRole('heading', {
      name: /^Stage 1\s*Information$/,
    });
    const person = screen.getByRole('heading', {
      name: /^Node type\s*Person$/,
    });

    expect(headingLevel(stages)).toBe(headingLevel(title) + 1);
    expect(headingLevel(codebook)).toBe(headingLevel(title) + 1);
    expect(headingLevel(welcome)).toBe(headingLevel(title) + 2);
    expect(headingLevel(person)).toBe(headingLevel(title) + 2);
    expect(
      screen.getByRole('heading', { name: /^Stage 2\s*Information$/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Protocol' }),
    ).not.toBeInTheDocument();
  });

  it('links each place without showing its translatable label', () => {
    renderMissingTranslations();

    expect(
      screen
        .getAllByRole('link', { name: 'Information' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/protocol/stage/welcome', '/protocol/stage/thanks']);
    expect(screen.getByRole('link', { name: 'Person' })).toHaveAttribute(
      'href',
      '/protocol/codebook?entity=node&type=person',
    );
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Node type\s*Person$/ }),
    ).not.toHaveTextContent('People');
  });

  it('draws a branch only where texts share part of their path', () => {
    renderMissingTranslations();

    expect(screen.getAllByRole('button', { name: /^title / })).toHaveLength(2);
    expect(textButton('1 › content Read this first')).toBeInTheDocument();
    expect(textButton('2 › content Then that')).toBeInTheDocument();
    expect(screen.getByText('items')).not.toHaveAttribute('role');
    expect(
      screen.queryByRole('button', { name: /^items/ }),
    ).not.toBeInTheDocument();
    expect(textButton('label People')).toBeInTheDocument();
  });

  it('names variables and joins a run of single steps into one row', () => {
    renderMissingTranslations({
      ...trilingual,
      stages: [],
      codebook: {
        node: {
          person: {
            name: 'Person',
            label: { en: 'People', fr: 'Personnes', es: 'Personas' },
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              v1: {
                name: 'closeness',
                label: 'Closeness',
                type: 'categorical',
                options: [
                  { label: { en: 'Close', es: 'Cerca' }, value: 1 },
                  { label: { en: 'Distant', es: 'Lejos' }, value: 2 },
                ],
              },
            },
          },
        },
        edge: {},
        ego: {},
      },
    });

    expect(
      screen.getByText('variables › closeness › options'),
    ).toBeInTheDocument();
    expect(textButton('1 › label Close')).toBeInTheDocument();
    expect(textButton('2 › label Distant')).toBeInTheDocument();
  });

  it('previews what participants see instead, in its own language', () => {
    renderMissingTranslations();

    expect(
      screen.getByText('5 texts have no French translation.'),
    ).toBeInTheDocument();
    const preview = screen.getByText('Hello');
    expect(preview).toHaveAttribute('lang', 'en');
    expect(preview).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('this').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('opens a dialog that edits the listed language first', async () => {
    const { user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');

    expect(dialog).toHaveAccessibleName('Stage 1 · Information title');
    const field = within(dialog).getByRole('textbox', { name: 'Text' });
    expect(field).toHaveValue('');
    expect(field.closest('[lang]')).toHaveAttribute('lang', 'fr');
  });

  it('shows what participants in each language see while the text is typed', async () => {
    const { user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');
    const french = languageEntry(dialog, 'French');

    expect(participantView(dialog)).toHaveLength(3);
    expect(languageEntry(dialog, 'English')).toHaveTextContent(
      /^English\s*Default\s*Hello$/,
    );
    expect(french).toHaveTextContent(
      /^French\s*Editing\s*Hello\s*Not translated yet\. Shown in English\.$/,
    );
    expect(languageEntry(dialog, 'Spanish')).toHaveTextContent(
      /^Spanish\s*Hola$/,
    );
    expect(within(french).getByText('Hello').closest('[lang]')).toHaveAttribute(
      'lang',
      'en',
    );

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Bonjour',
    );

    expect(french).toHaveTextContent(/^French\s*Editing\s*Bonjour$/);
    expect(
      within(french).getByText('Bonjour').closest('[lang]'),
    ).toHaveAttribute('lang', 'fr');
    expect(hasDirtyNestedDraft()).toBe(true);
  });

  it('notes text in an unidentified language without naming it', async () => {
    const { user } = renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'und', locales: ['und', 'fr'] },
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [
        {
          id: 'welcome',
          type: 'Information',
          label: { und: 'Welcome', fr: 'Bienvenue' },
          title: { und: 'Hello' },
          items: [],
        },
      ],
    });

    const dialog = await openText(user, 'title Hello');

    expect(languageEntry(dialog, 'French')).toHaveTextContent(
      /^French\s*Editing\s*Hello\s*Not translated yet\.$/,
    );
  });

  it('saves the translations, then moves focus to the next text', async () => {
    const { store, user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Bonjour',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(stageTitle(store, 0)).toEqual({
      en: 'Hello',
      es: 'Hola',
      fr: 'Bonjour',
    });
    expect(
      await screen.findByText('French translation saved.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(textButton('1 › content Read this first')).toHaveFocus(),
    );
    expect(
      screen.queryByRole('button', { name: 'title Hello' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('4 texts have no French translation.'),
    ).toBeInTheDocument();
  });

  it('moves focus to the next text when saving redraws its row', async () => {
    const { user } = renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [
        {
          id: 'gallery',
          type: 'Information',
          label: { en: 'Gallery', fr: 'Galerie' },
          title: { en: 'Pictures', fr: 'Images' },
          items: [
            {
              id: 'first',
              type: 'asset',
              content: 'first-picture',
              description: { en: 'A garden' },
            },
            {
              id: 'second',
              type: 'asset',
              content: 'second-picture',
              description: { en: 'A river' },
            },
          ],
        },
      ],
    });

    const dialog = await openText(user, '1 › description A garden');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Un jardin',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(textButton('items › 2 › description A river')).toHaveFocus(),
    );
  });

  it('moves focus to the previous text after saving the last one', async () => {
    const { user } = renderMissingTranslations();

    const dialog = await openText(user, 'label People');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Personnes',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(textButton('title Thank you')).toHaveFocus());
    expect(
      screen.queryByRole('heading', { name: 'Codebook' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a text listed, and focus on it, while its listed translation is missing', async () => {
    const { store, user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');
    await chooseEditingLanguage(user, /^español/);
    const field = within(dialog).getByRole('textbox', { name: 'Text' });
    await user.clear(field);
    await user.type(field, 'Hola a todos');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(stageTitle(store, 0)).toEqual({ en: 'Hello', es: 'Hola a todos' });
    expect(await screen.findByText('Translations saved.')).toBeInTheDocument();
    await waitFor(() => expect(textButton('title Hello')).toHaveFocus());
  });

  it('closes without saving when nothing was changed', async () => {
    const { store, user } = renderMissingTranslations();
    const before = getProtocol(store.getState());

    const dialog = await openText(user, 'title Hello');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(textButton('title Hello')).toHaveFocus());
    expect(getProtocol(store.getState())).toBe(before);
    expect(screen.queryByText('Translations saved.')).not.toBeInTheDocument();
  });

  it('returns focus to the text when the dialog is cancelled', async () => {
    const { user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(textButton('title Hello')).toHaveFocus());
  });

  it('refuses translations in a language removed while the dialog was open', async () => {
    const { store, user } = renderMissingTranslations();

    const dialog = await openText(user, 'title Hello');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Bonjour',
    );
    store.dispatch(removeProtocolLocale({ locale: 'es' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText(
        'These translations could not be saved, because this text or one of its languages has been removed from the protocol. Select Cancel to close the dialog.',
      ),
    ).toBeInTheDocument();
    expect(stageTitle(store, 0)).toEqual({ en: 'Hello' });
    expect(dialog).toBeInTheDocument();
  });

  it('lists one language at a time, chosen from the languages with gaps', async () => {
    const { onLanguageChange, user } = renderMissingTranslations();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show missing translations for' }),
      'Spanish (1)',
    );

    expect(onLanguageChange).toHaveBeenCalledWith('es');
    expect(
      screen.getByText('1 text has no Spanish translation.'),
    ).toBeInTheDocument();
    expect(textButton('title Thank you')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'title Hello' }),
    ).not.toBeInTheDocument();
  });

  it('moves on to the next language once one is fully translated', async () => {
    const { onLanguageChange, headingRef, user } = renderMissingTranslations();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show missing translations for' }),
      'Spanish (1)',
    );
    const dialog = await openText(user, 'title Thank you');
    const field = within(dialog).getByRole('textbox', { name: 'Text' });
    expect(field.closest('[lang]')).toHaveAttribute('lang', 'es');
    await user.type(field, 'Gracias');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(onLanguageChange).toHaveBeenLastCalledWith('fr');
    expect(
      await screen.findByText(
        'Spanish translation saved. Every text now has a Spanish translation, so the list shows texts with no French translation instead.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(headingRef.current).toHaveFocus());
    expect(
      screen.queryByRole('combobox', { name: 'Show missing translations for' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('5 texts have no French translation.'),
    ).toBeInTheDocument();
  });

  it('says when every text is translated', async () => {
    const { headingRef, user } = renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [
        {
          id: 'welcome',
          type: 'Information',
          label: { en: 'Welcome', fr: 'Bienvenue' },
          title: { en: 'Hello' },
          items: [],
        },
      ],
    });

    const dialog = await openText(user, 'title Hello');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Text' }),
      'Bonjour',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'French translation saved. Every text is now translated into every language.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Every text is translated into every language.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(headingRef.current).toHaveFocus());
  });

  it('says when the protocol has one language', () => {
    renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    });

    expect(
      screen.getByText(
        'This protocol has one language. Add a language to start translating.',
      ),
    ).toBeInTheDocument();
  });
});
