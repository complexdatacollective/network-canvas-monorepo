import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  getLocaleMetadata,
  type LocaleTag,
} from '@codaco/protocol-validation';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import {
  removeProtocolLocale,
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import { ArchitectLanguageNaming } from '../ArchitectLanguageNaming';
import MissingTranslations from '../MissingTranslations';

// Paths whose texts the builder is made to have no name for, so the list
// falls back to showing them as paths.
const unnamed = vi.hoisted(() => ({ paths: new Set<string>() }));

vi.mock(
  '@codaco/protocol-builder/localization/localizedTextNames',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@codaco/protocol-builder/localization/localizedTextNames')
      >();
    return {
      ...original,
      nameLocalizedText: (
        ...args: Parameters<typeof original.nameLocalizedText>
      ) =>
        unnamed.paths.has(JSON.stringify(args[2]))
          ? undefined
          : original.nameLocalizedText(...args),
    };
  },
);

beforeEach(() => {
  unnamed.paths.clear();
});

// French is missing the welcome heading, both welcome texts, the thanks
// heading and the person type's label; Spanish is missing only the thanks
// heading.
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

const oneStage = (
  locales: readonly LocaleTag[],
  stage: CurrentProtocol['stages'][number],
  defaultLocale: LocaleTag = 'en',
): CurrentProtocol => ({
  ...trilingual,
  localization: { defaultLocale, locales: [...locales] },
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [stage],
});

// German, French and Spanish each miss only the heading, and are declared out
// of alphabetical order.
const quadrilingual = oneStage(['en', 'de', 'fr', 'es'], {
  id: 'welcome',
  type: 'Information',
  label: {
    en: 'Welcome',
    de: 'Willkommen',
    fr: 'Bienvenue',
    es: 'Bienvenida',
  },
  title: { en: 'Hello' },
  items: [],
});

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
      <>
        {/* Stands in for the language list's "Show missing translations". */}
        <button type="button" onClick={() => setLanguage('es')}>
          Show Spanish
        </button>
        <MissingTranslations
          language={language}
          onLanguageChange={(locale) => {
            onLanguageChange(locale);
            setLanguage(locale);
          }}
          headingRef={headingRef}
        />
      </>
    );
  };

  render(
    <Provider store={store}>
      <ArchitectLanguageNaming>
        <Page />
      </ArchitectLanguageNaming>
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

const textField = (dialog: HTMLElement) =>
  within(dialog).getByRole('textbox', { name: 'Text' });

const stageTitle = (store: Rendered['store'], index: number) => {
  const stage = getProtocol(store.getState())?.stages[index];
  return stage && 'title' in stage ? stage.title : undefined;
};

const participantView = (dialog: HTMLElement) =>
  within(dialog).getByRole('region', { name: 'What participants see' });

const languageCards = (dialog: HTMLElement) =>
  within(participantView(dialog)).getAllByRole('listitem');

const languageCard = (dialog: HTMLElement, language: string) => {
  const card = languageCards(dialog).find(
    (item) =>
      within(item).queryByRole('button', { name: `Edit ${language}` }) !== null,
  );
  if (!card) throw new Error(`No card for ${language}`);
  return card;
};

const editButton = (dialog: HTMLElement, language: string) =>
  within(participantView(dialog)).getByRole('button', {
    name: `Edit ${language}`,
  });

const sourceText = (dialog: HTMLElement) =>
  within(dialog).queryByRole('group', { name: /^Translating from/ });

const BROWSER_FOOTNOTE =
  'Participants whose browser also lists a language that has this text see it in that language instead.';

describe('MissingTranslations', () => {
  describe('the list', () => {
    it('lists texts by category, then by the stage or type that holds them', () => {
      renderMissingTranslations();

      const title = screen.getByRole('heading', {
        name: 'Missing translations',
      });
      const stages = screen.getByRole('heading', { name: 'Stages' });
      const codebook = screen.getByRole('heading', { name: 'Codebook' });
      const welcome = screen.getByRole('heading', {
        name: /^Stage 1\s*Welcome · Information$/,
      });
      const person = screen.getByRole('heading', {
        name: /^Node type\s*Person$/,
      });

      expect(headingLevel(stages)).toBe(headingLevel(title) + 1);
      expect(headingLevel(codebook)).toBe(headingLevel(title) + 1);
      expect(headingLevel(welcome)).toBe(headingLevel(title) + 2);
      expect(headingLevel(person)).toBe(headingLevel(title) + 2);
      expect(
        screen.getByRole('heading', {
          name: /^Stage 2\s*Thanks · Information$/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Protocol' }),
      ).not.toBeInTheDocument();
    });

    it('links each place by its name, in the default language', () => {
      renderMissingTranslations();

      const welcome = screen.getByRole('link', { name: 'Welcome' });
      expect(welcome).toHaveAttribute('href', '/protocol/stage/welcome');
      expect(welcome.querySelector('[lang]')).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('link', { name: 'Thanks' })).toHaveAttribute(
        'href',
        '/protocol/stage/thanks',
      );
      expect(screen.getByRole('link', { name: 'Person' })).toHaveAttribute(
        'href',
        '/protocol/codebook?entity=node&type=person',
      );
      expect(screen.queryByText('Bienvenue')).not.toBeInTheDocument();
    });

    it('names each text as its editor does, branching only where texts part', () => {
      renderMissingTranslations();

      expect(screen.getByText('Page content')).not.toHaveAttribute('role');
      expect(textButton('Page heading Hello')).toBeInTheDocument();
      expect(
        textButton('Item 1 › Content Read this first'),
      ).toBeInTheDocument();
      expect(textButton('Item 2 › Content Then that')).toBeInTheDocument();
      expect(
        textButton('Page content › Page heading Thank you'),
      ).toBeInTheDocument();
      expect(textButton('Node type label People')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Page content Hello/ }),
      ).not.toBeInTheDocument();
    });

    it('shows a text it has no name for by its path, as code', () => {
      unnamed.paths.add(JSON.stringify(['stages', 0, 'items', 0, 'content']));
      renderMissingTranslations();

      const button = textButton('items › 1 › content Read this first');
      const path = within(button).getByText('items › 1 › content');
      expect(path).toHaveAttribute('dir', 'ltr');
      expect(path).toHaveClass('font-monospace');
      expect(
        within(textButton('Page heading Hello')).getByText('Page heading'),
      ).not.toHaveClass('font-monospace');
    });

    it('previews what participants see instead, in its own language', () => {
      renderMissingTranslations();

      const preview = within(textButton('Page heading Hello')).getByText(
        'Hello',
      );
      expect(preview).toHaveAttribute('lang', 'en');
      expect(preview).toHaveAttribute('dir', 'ltr');
      expect(screen.getByText('this').tagName).toBe('STRONG');
      expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/texts? ha(s|ve) no French translation/),
      ).not.toBeInTheDocument();
    });

    it('previews each block of markdown on its own line, without anything a button cannot hold', () => {
      renderMissingTranslations(
        oneStage(['en', 'fr'], {
          id: 'welcome',
          type: 'Information',
          label: { en: 'Welcome', fr: 'Bienvenue' },
          title: { en: 'Hello', fr: 'Bonjour' },
          items: [
            {
              id: 'intro',
              type: 'text',
              content: {
                en: '## About\n\nRead the [notes](https://example.com).\n\n- One\n- Two',
              },
            },
          ],
        }),
      );

      const button = screen.getByRole('button', {
        name: /^Page content › Item 1 › Content About\s+Read the notes\.\s+One\s+Two$/,
      });
      expect(button.querySelector('p, h2, ul, li, a')).toBeNull();
      expect(
        [...button.querySelectorAll('span.block')].map(
          (block) => block.textContent,
        ),
      ).toEqual(expect.arrayContaining(['About', 'Read the notes.']));
    });
  });

  describe('choosing a language', () => {
    it('lists one language at a time, in a tab for each language with gaps', async () => {
      const { onLanguageChange, user } = renderMissingTranslations();

      const tabs = within(
        screen.getByRole('tablist', {
          name: 'Languages with missing translations',
        }),
      ).getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^French5/)]),
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
        'French, 5 missing translations',
      );

      await user.click(
        screen.getByRole('tab', { name: 'Spanish, 1 missing translation' }),
      );

      expect(onLanguageChange).toHaveBeenCalledWith('es');
      expect(
        textButton('Page content › Page heading Thank you'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Page heading Hello' }),
      ).not.toBeInTheDocument();
    });

    it('orders the tabs alphabetically by language name', () => {
      renderMissingTranslations(quadrilingual);

      const [french, german, spanish] = screen.getAllByRole('tab');
      expect(french).toHaveAccessibleName('French, 1 missing translation');
      expect(french).toHaveAttribute('aria-selected', 'true');
      expect(german).toHaveAccessibleName('German, 1 missing translation');
      expect(spanish).toHaveAccessibleName('Spanish, 1 missing translation');
    });

    it('selects the tab of a language chosen elsewhere on the page', async () => {
      const { user } = renderMissingTranslations();

      await user.click(screen.getByRole('button', { name: 'Show Spanish' }));

      expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
        'Spanish, 1 missing translation',
      );
      expect(
        textButton('Page content › Page heading Thank you'),
      ).toBeInTheDocument();
    });

    it('chooses from a menu instead when more than five languages have gaps', async () => {
      const locales = ['en', 'nl', 'fr', 'de', 'it', 'pt', 'es'];
      const { onLanguageChange, user } = renderMissingTranslations(
        oneStage(locales, {
          id: 'welcome',
          type: 'Information',
          label: Object.fromEntries(
            locales.map((locale) => [locale, 'Welcome']),
          ),
          title: { en: 'Hello' },
          items: [],
        }),
      );

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      const menu = screen.getByRole('combobox', {
        name: 'Show missing translations for',
      });
      expect(
        within(menu)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'Dutch (1)',
        'French (1)',
        'German (1)',
        'Italian (1)',
        'Portuguese (1)',
        'Spanish (1)',
      ]);

      await user.selectOptions(menu, 'Spanish (1)');

      expect(onLanguageChange).toHaveBeenCalledWith('es');
    });
  });

  describe('the translation dialog', () => {
    it('opens on the listed language, named by where the text is and what it is', async () => {
      const { user } = renderMissingTranslations();

      const dialog = await openText(user, 'Page heading Hello');

      expect(dialog).toHaveAccessibleName(
        'Welcome · Information Page content › Page heading',
      );
      expect(dialog).toHaveAccessibleDescription(
        'Text 1 of 5 to translate into French',
      );
      const field = textField(dialog);
      expect(field).toHaveValue('');
      expect(field.closest('[lang]')).toHaveAttribute('lang', 'fr');
    });

    it('asks for the text in at least one language, without marking it required', async () => {
      const { store, user } = renderMissingTranslations(
        oneStage(['en', 'fr'], {
          id: 'welcome',
          type: 'Information',
          label: { en: 'Welcome', fr: 'Bienvenue' },
          title: { en: 'Hello' },
          items: [],
        }),
      );

      const dialog = await openText(user, 'Page content › Page heading Hello');
      expect(textField(dialog)).toHaveAccessibleDescription(
        /^At least one language needs this text\.\s*$/,
      );
      expect(textField(dialog)).not.toBeRequired();
      expect(within(dialog).queryByText('*')).not.toBeInTheDocument();

      await user.click(editButton(dialog, 'English'));
      await user.clear(textField(dialog));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText(
          'Write this text in at least one language.',
        ),
      ).toBeInTheDocument();
      expect(stageTitle(store, 0)).toEqual({ en: 'Hello' });
    });

    it('leaves out the field’s own untranslated note', async () => {
      const { user } = renderMissingTranslations();

      const dialog = await openText(user, 'Page heading Hello');

      expect(
        within(dialog).queryByText(/^Not translated into French yet/),
      ).not.toBeInTheDocument();
    });

    describe('what participants see', () => {
      it('shows each language’s text, tagging the ones shown in another language', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        const french = languageCard(dialog, 'French');

        expect(languageCards(dialog)).toHaveLength(3);
        expect(languageCard(dialog, 'English')).toHaveTextContent(
          /^English\s*Default\s*Hello$/,
        );
        expect(french).toHaveTextContent(
          /^French\s*Editing\s*Shown in English\*\s*Hello$/,
        );
        expect(languageCard(dialog, 'Spanish')).toHaveTextContent(
          /^Spanish\s*Hola$/,
        );
        const fallback = within(french).getByText('Hello');
        expect(fallback.closest('[lang]')).toHaveAttribute('lang', 'en');
        expect(fallback.closest('div')).toHaveClass('text-current/70');

        await user.type(textField(dialog), 'Bonjour');

        expect(french).toHaveTextContent(/^French\s*Editing\s*Bonjour$/);
        expect(
          within(french).getByText('Bonjour').closest('[lang]'),
        ).toHaveAttribute('lang', 'fr');
        expect(hasDirtyNestedDraft()).toBe(true);
      });

      it('notes once that a browser can choose another language that has the text', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');

        expect(within(dialog).getAllByText(BROWSER_FOOTNOTE)).toHaveLength(1);
        expect(editButton(dialog, 'French')).toHaveAccessibleDescription(
          `Shown in English ${BROWSER_FOOTNOTE}`,
        );
      });

      it('leaves the browser out when only one language has the text', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(
          user,
          'Page content › Page heading Thank you',
        );

        expect(languageCard(dialog, 'French')).toHaveTextContent(
          /^French\s*Editing\s*Shown in English\s*Thank you$/,
        );
        expect(
          within(dialog).queryByText(BROWSER_FOOTNOTE),
        ).not.toBeInTheDocument();
        expect(editButton(dialog, 'French')).toHaveAccessibleDescription(
          'Shown in English',
        );
      });

      it('leaves the browser out when a closely related translation is shown', async () => {
        const mexican = getLocaleMetadata('es-MX', 'en').label;
        const { user } = renderMissingTranslations(
          oneStage(['en', 'es', 'es-MX'], {
            id: 'welcome',
            type: 'Information',
            label: {
              'en': 'Welcome',
              'es': 'Bienvenida',
              'es-MX': 'Bienvenida',
            },
            title: { en: 'Hello', es: 'Hola' },
            items: [],
          }),
        );

        const dialog = await openText(user, 'Page content › Page heading Hola');

        expect(languageCard(dialog, mexican)).toHaveTextContent(
          /Shown in Spanish\s*Hola$/,
        );
        expect(
          within(dialog).queryByText(BROWSER_FOOTNOTE),
        ).not.toBeInTheDocument();
      });

      it('notes text in an unidentified language without naming it', async () => {
        const { user } = renderMissingTranslations(
          oneStage(
            ['und', 'fr'],
            {
              id: 'welcome',
              type: 'Information',
              label: { und: 'Welcome', fr: 'Bienvenue' },
              title: { und: 'Hello' },
              items: [],
            },
            'und',
          ),
        );

        const dialog = await openText(
          user,
          'Page content › Page heading Hello',
        );

        expect(languageCard(dialog, 'French')).toHaveTextContent(
          /^French\s*Editing\s*Hello\s*Not translated yet\.$/,
        );
        expect(editButton(dialog, 'French')).toHaveAccessibleDescription(
          'Not translated yet.',
        );
      });

      it('lists the languages alphabetically by name', async () => {
        const { user } = renderMissingTranslations(quadrilingual);

        const dialog = await openText(
          user,
          'Page content › Page heading Hello',
        );

        expect(
          within(participantView(dialog))
            .getAllByRole('button', { name: /^Edit / })
            .map((button) => button.textContent),
        ).toEqual(['English', 'French', 'German', 'Spanish']);
      });

      it('edits a language chosen from its card, ready to type', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        expect(editButton(dialog, 'French')).toHaveAttribute(
          'aria-current',
          'true',
        );

        await user.click(editButton(dialog, 'Spanish'));

        expect(editButton(dialog, 'Spanish')).toHaveAttribute(
          'aria-current',
          'true',
        );
        expect(editButton(dialog, 'French')).not.toHaveAttribute(
          'aria-current',
        );
        const field = textField(dialog);
        expect(field).toHaveValue('Hola');
        expect(field.closest('[lang]')).toHaveAttribute('lang', 'es');
        await waitFor(() => expect(field).toHaveFocus());
      });

      it('edits a card’s language from the keyboard', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        editButton(dialog, 'English').focus();
        await user.keyboard('{Enter}');

        expect(editButton(dialog, 'English')).toHaveAttribute(
          'aria-current',
          'true',
        );
        await waitFor(() => expect(textField(dialog)).toHaveFocus());
        expect(textField(dialog)).toHaveValue('Hello');
      });
    });

    describe('translating from another language', () => {
      it('shows the default language’s text to translate from, as participants see it', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Item 1 › Content Read this first');
        const source = sourceText(dialog);

        expect(source).toHaveAccessibleName('Translating from English');
        expect(source?.querySelector('[lang]')).toHaveAttribute('lang', 'en');
        expect(within(source ?? dialog).getByText('this').tagName).toBe(
          'STRONG',
        );
      });

      it('translates from another language that has the text, when asked', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(
          within(dialog).getByRole('button', {
            name: 'Translating from English',
          }),
        );
        await user.click(
          await screen.findByRole('menuitemradio', { name: /^Spanish/ }),
        );

        const source = sourceText(dialog);
        expect(source).toHaveAccessibleName('Translating from Spanish');
        expect(within(source ?? dialog).getByText('Hola')).toBeInTheDocument();
      });

      it('never translates from the language being edited', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(editButton(dialog, 'English'));

        const source = sourceText(dialog);
        expect(source).toHaveAccessibleName('Translating from Spanish');
        expect(
          within(dialog).queryByRole('button', { name: /^Translating from/ }),
        ).not.toBeInTheDocument();
      });

      it('starts from the alphabetically first language when the default has no text', async () => {
        const { user } = renderMissingTranslations(
          oneStage(['en', 'fr', 'de', 'es'], {
            id: 'welcome',
            type: 'Information',
            label: {
              en: 'Welcome',
              fr: 'Bienvenue',
              de: 'Willkommen',
              es: 'Bienvenida',
            },
            title: { fr: 'Bonjour', es: 'Hola' },
            items: [],
          }),
        );

        await user.click(
          screen.getByRole('tab', { name: 'English, 1 missing translation' }),
        );
        const dialog = await openText(user, 'Page content › Page heading Hola');

        expect(sourceText(dialog)).toHaveAccessibleName(
          'Translating from French',
        );
      });

      it('shows nothing to translate from when only the language being edited has the text', async () => {
        const { user } = renderMissingTranslations(
          oneStage(['en', 'fr'], {
            id: 'welcome',
            type: 'Information',
            label: { en: 'Welcome', fr: 'Bienvenue' },
            title: { fr: 'Bonjour' },
            items: [],
          }),
        );

        const dialog = await openText(
          user,
          'Page content › Page heading Bonjour',
        );
        expect(sourceText(dialog)).toHaveAccessibleName(
          'Translating from French',
        );

        await user.click(editButton(dialog, 'French'));

        expect(sourceText(dialog)).not.toBeInTheDocument();
      });
    });

    describe('saving', () => {
      it('saves the translations, then moves focus to the next text', async () => {
        const { store, user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.type(textField(dialog), 'Bonjour');
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
          expect(textButton('Item 1 › Content Read this first')).toHaveFocus(),
        );
        expect(
          screen.queryByRole('button', { name: 'Page heading Hello' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('tab', { selected: true }),
        ).toHaveAccessibleName('French, 4 missing translations');
      });

      it('moves focus to the next text when saving redraws its row', async () => {
        const { user } = renderMissingTranslations(
          oneStage(['en', 'fr'], {
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
          }),
        );

        const dialog = await openText(user, 'Item 1 › Description A garden');
        await user.type(textField(dialog), 'Un jardin');
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() =>
          expect(
            textButton('Page content › Item 2 › Description A river'),
          ).toHaveFocus(),
        );
      });

      it('moves focus to the previous text after saving the last one', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Node type label People');
        await user.type(textField(dialog), 'Personnes');
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() =>
          expect(
            textButton('Page content › Page heading Thank you'),
          ).toHaveFocus(),
        );
        expect(
          screen.queryByRole('heading', { name: 'Codebook' }),
        ).not.toBeInTheDocument();
      });

      it('keeps a text listed, and focus on it, while its listed translation is missing', async () => {
        const { store, user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(editButton(dialog, 'Spanish'));
        const field = textField(dialog);
        await user.clear(field);
        await user.type(field, 'Hola a todos');
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        expect(stageTitle(store, 0)).toEqual({
          en: 'Hello',
          es: 'Hola a todos',
        });
        expect(
          await screen.findByText('Translations saved.'),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(textButton('Page heading Hello')).toHaveFocus(),
        );
      });

      it('closes without saving when nothing was changed', async () => {
        const { store, user } = renderMissingTranslations();
        const before = getProtocol(store.getState());

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() =>
          expect(textButton('Page heading Hello')).toHaveFocus(),
        );
        expect(getProtocol(store.getState())).toBe(before);
        expect(
          screen.queryByText('Translations saved.'),
        ).not.toBeInTheDocument();
      });

      it('returns focus to the text when the dialog is cancelled', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(
          within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() =>
          expect(textButton('Page heading Hello')).toHaveFocus(),
        );
      });

      it('refuses translations in a language removed while the dialog was open', async () => {
        const { store, user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.type(textField(dialog), 'Bonjour');
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
    });

    describe('save and next', () => {
      it('saves, then shows the next untranslated text in the same dialog', async () => {
        const { store, user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.type(textField(dialog), 'Bonjour');
        await user.click(
          within(dialog).getByRole('button', { name: 'Save and next' }),
        );

        expect(stageTitle(store, 0)).toEqual({
          en: 'Hello',
          es: 'Hola',
          fr: 'Bonjour',
        });
        await waitFor(() =>
          expect(dialog).toHaveAccessibleName(
            'Welcome · Information Page content › Item 1 › Content',
          ),
        );
        expect(dialog).toHaveAccessibleDescription(
          'Text 2 of 5 to translate into French',
        );
        expect(within(dialog).getByRole('status')).toHaveTextContent(
          'Saved. Showing text 2 of 5: Welcome · Information, Page content › Item 1 › Content.',
        );
        const field = textField(dialog);
        expect(field.textContent).toBe('');
        expect(field.closest('[lang]')).toHaveAttribute('lang', 'fr');
        await waitFor(() => expect(field).toHaveFocus());
        expect(sourceText(dialog)).toHaveTextContent('Read this first');
        expect(hasDirtyNestedDraft()).toBe(false);
      });

      it('starts the next text in the listed language, whichever language was last edited', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(editButton(dialog, 'Spanish'));
        await user.click(
          within(dialog).getByRole('button', { name: 'Save and next' }),
        );

        await waitFor(() =>
          expect(dialog).toHaveAccessibleDescription(
            'Text 2 of 5 to translate into French',
          ),
        );
        expect(editButton(dialog, 'French')).toHaveAttribute(
          'aria-current',
          'true',
        );
        expect(textField(dialog).closest('[lang]')).toHaveAttribute(
          'lang',
          'fr',
        );
      });

      it('moves on without saving a text left unchanged', async () => {
        const { store, user } = renderMissingTranslations();
        const before = getProtocol(store.getState());

        const dialog = await openText(user, 'Page heading Hello');
        await user.click(
          within(dialog).getByRole('button', { name: 'Save and next' }),
        );

        await waitFor(() =>
          expect(dialog).toHaveAccessibleDescription(
            'Text 2 of 5 to translate into French',
          ),
        );
        expect(getProtocol(store.getState())).toBe(before);
      });

      it('lets the dialog close without asking once the shown text is saved', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Page heading Hello');
        await user.type(textField(dialog), 'Bonjour');
        await user.click(
          within(dialog).getByRole('button', { name: 'Save and next' }),
        );
        await waitFor(() =>
          expect(dialog).toHaveAccessibleDescription(
            'Text 2 of 5 to translate into French',
          ),
        );
        await user.click(
          within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        expect(
          globalThis.__architectDialogMocks.openDialog,
        ).not.toHaveBeenCalled();
        await waitFor(() => expect(dialog).not.toBeInTheDocument());
        await waitFor(() =>
          expect(textButton('Item 1 › Content Read this first')).toHaveFocus(),
        );
      });

      it('offers only Save on the last text', async () => {
        const { user } = renderMissingTranslations();

        const dialog = await openText(user, 'Node type label People');

        expect(dialog).toHaveAccessibleDescription(
          'Text 5 of 5 to translate into French',
        );
        expect(
          within(dialog).queryByRole('button', { name: 'Save and next' }),
        ).not.toBeInTheDocument();
        expect(
          within(dialog).getByRole('button', { name: 'Save' }),
        ).toBeInTheDocument();
      });

      it('saves the last text and closes, as Save does', async () => {
        const { store, user } = renderMissingTranslations();

        const dialog = await openText(
          user,
          'Page content › Page heading Thank you',
        );
        await user.type(textField(dialog), 'Merci');
        await user.click(
          within(dialog).getByRole('button', { name: 'Save and next' }),
        );
        await waitFor(() =>
          expect(dialog).toHaveAccessibleDescription(
            'Text 5 of 5 to translate into French',
          ),
        );
        await user.type(textField(dialog), 'Personnes');
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(dialog).not.toBeInTheDocument());
        expect(stageTitle(store, 1)).toEqual({
          en: 'Thank you',
          fr: 'Merci',
        });
        expect(
          getProtocol(store.getState())?.codebook.node?.person?.label,
        ).toEqual({ en: 'People', es: 'Personas', fr: 'Personnes' });
        await waitFor(() =>
          expect(textButton('Item 2 › Content Then that')).toHaveFocus(),
        );
      });
    });
  });

  describe('when a language is done', () => {
    it('moves on to the next language once one is fully translated', async () => {
      const { onLanguageChange, headingRef, user } =
        renderMissingTranslations();

      await user.click(
        screen.getByRole('tab', { name: 'Spanish, 1 missing translation' }),
      );
      const dialog = await openText(
        user,
        'Page content › Page heading Thank you',
      );
      const field = textField(dialog);
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
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
        'French, 5 missing translations',
      );
    });

    it('moves on to the alphabetically next language once one is fully translated', async () => {
      const { onLanguageChange, user } =
        renderMissingTranslations(quadrilingual);

      const dialog = await openText(user, 'Page content › Page heading Hello');
      await user.type(textField(dialog), 'Bonjour');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(onLanguageChange).toHaveBeenLastCalledWith('de');
      expect(
        await screen.findByText(
          'French translation saved. Every text now has a French translation, so the list shows texts with no German translation instead.',
        ),
      ).toBeInTheDocument();
    });

    it('says when every text is translated', async () => {
      const { headingRef, user } = renderMissingTranslations(
        oneStage(['en', 'fr'], {
          id: 'welcome',
          type: 'Information',
          label: { en: 'Welcome', fr: 'Bienvenue' },
          title: { en: 'Hello' },
          items: [],
        }),
      );

      const dialog = await openText(user, 'Page content › Page heading Hello');
      await user.type(textField(dialog), 'Bonjour');
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
});
