import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import MissingTranslations from '../MissingTranslations';

// French is missing the welcome title, the welcome text and the thanks title;
// Spanish is missing only the thanks title.
const trilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'es'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
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

const addButton = (language: string, text: string) =>
  screen.getByRole('button', {
    name: `Add ${language} translation`,
    description: text,
  });

const stageTitle = (
  store: ReturnType<typeof renderMissingTranslations>['store'],
  index: number,
) => {
  const stage = getProtocol(store.getState())?.stages[index];
  return stage && 'title' in stage ? stage.title : undefined;
};

describe('MissingTranslations', () => {
  it('heads each place one level below the section title', () => {
    renderMissingTranslations();

    const title = screen.getByRole('heading', { name: 'Missing translations' });
    const place = screen.getByRole('heading', { name: /Welcome/ });
    const titleLevel = Number(title.tagName.slice(1));

    expect(Number(place.tagName.slice(1))).toBe(titleLevel + 1);
  });

  it('shows the text participants see in place of each missing translation', () => {
    renderMissingTranslations();

    expect(
      screen.getByText('3 texts have no French translation.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Participants who choose French see this English text instead:',
      ),
    ).toHaveLength(3);
    const fallback = screen.getByText('Hello').closest('blockquote');
    expect(fallback).toHaveAttribute('lang', 'en');
    expect(fallback).toHaveAttribute('dir', 'ltr');
    expect(screen.getAllByText('title')).toHaveLength(2);
    expect(screen.getByText('items[0].content')).toBeInTheDocument();
  });

  it('leaves an unidentified language out of the caption', () => {
    renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'und', locales: ['und', 'fr'] },
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

    expect(
      screen.getByText('Participants who choose French see this text instead:'),
    ).toBeInTheDocument();
  });

  it('renders markdown text as participants see it', () => {
    renderMissingTranslations();

    expect(screen.getByText('this').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('saves a translation, removes its card and moves focus to the next card', async () => {
    const { store, user } = renderMissingTranslations();

    await user.click(addButton('French', 'Hello'));
    const field = screen.getByRole('textbox', { name: 'French translation' });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('lang', 'fr');
    await user.type(field, 'Bonjour');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(stageTitle(store, 0)).toEqual({
        en: 'Hello',
        es: 'Hola',
        fr: 'Bonjour',
      }),
    );
    expect(
      await screen.findByText('French translation saved.'),
    ).toBeInTheDocument();
    expect(addButton('French', 'Read this first')).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryByText('Hello')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('2 texts have no French translation.'),
    ).toBeInTheDocument();
  });

  it('moves focus to the previous card after saving the last one', async () => {
    const { user } = renderMissingTranslations();

    await user.click(addButton('French', 'Thank you'));
    await user.type(
      screen.getByRole('textbox', { name: 'French translation' }),
      'Merci beaucoup',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(addButton('French', 'Read this first')).toHaveFocus(),
    );
  });

  it('refuses a blank translation', async () => {
    const { store, user } = renderMissingTranslations();

    await user.click(addButton('French', 'Hello'));
    await user.type(
      screen.getByRole('textbox', { name: 'French translation' }),
      '   ',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Write the French translation before saving.'),
    ).toBeInTheDocument();
    expect(stageTitle(store, 0)).toEqual({ en: 'Hello', es: 'Hola' });
  });

  it('returns focus to the Add button when the editor is cancelled', async () => {
    const { user } = renderMissingTranslations();

    await user.click(addButton('French', 'Hello'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('textbox', { name: 'French translation' }),
    ).not.toBeInTheDocument();
    expect(addButton('French', 'Hello')).toHaveFocus();
  });

  it('asks before Escape discards typed text, and keeps it when declined', async () => {
    const { openDialog } = globalThis.__architectDialogMocks;
    const { user } = renderMissingTranslations();

    await user.click(addButton('French', 'Hello'));
    await user.type(
      screen.getByRole('textbox', { name: 'French translation' }),
      'Bonj',
    );
    openDialog.mockResolvedValueOnce(false);
    await user.keyboard('{Escape}');

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('textbox', { name: 'French translation' }),
    ).toHaveValue('Bonj');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(addButton('French', 'Hello')).toHaveFocus());
    expect(openDialog).toHaveBeenCalledTimes(2);
  });

  it('keeps typed text while another language is shown', async () => {
    const { user } = renderMissingTranslations();

    await user.click(addButton('French', 'Hello'));
    await user.type(
      screen.getByRole('textbox', { name: 'French translation' }),
      'Bonj',
    );
    const picker = screen.getByRole('combobox', {
      name: 'Show missing translations for',
    });
    await user.selectOptions(picker, 'Spanish (1)');
    await user.selectOptions(picker, 'French (3)');

    expect(
      screen.getByRole('textbox', { name: 'French translation' }),
    ).toHaveValue('Bonj');
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
    expect(
      screen.getByText(
        'Participants who choose Spanish see this English text instead:',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('moves on to the next language once one is fully translated', async () => {
    const { onLanguageChange, headingRef, user } = renderMissingTranslations();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show missing translations for' }),
      'Spanish (1)',
    );
    await user.click(addButton('Spanish', 'Thank you'));
    await user.type(
      screen.getByRole('textbox', { name: 'Spanish translation' }),
      'Gracias',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onLanguageChange).toHaveBeenLastCalledWith('fr');
    expect(
      await screen.findByText(
        'Spanish translation saved. Every text now has a Spanish translation, so the list shows texts with no French translation instead.',
      ),
    ).toBeInTheDocument();
    expect(headingRef.current).toHaveFocus();
    expect(
      screen.queryByRole('combobox', { name: 'Show missing translations for' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('3 texts have no French translation.'),
    ).toBeInTheDocument();
  });

  it('says when every text is translated', () => {
    renderMissingTranslations({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en'] },
      stages: [],
    });

    expect(
      screen.getByText(
        'This protocol has one language. Add a language to start translating.',
      ),
    ).toBeInTheDocument();
  });
});
