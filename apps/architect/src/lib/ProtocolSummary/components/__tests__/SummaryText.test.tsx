import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  CurrentProtocol,
  LocalizedString,
} from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import SummaryContext from '../SummaryContext';
import { SummaryMarkdown, SummaryText } from '../SummaryText';

afterEach(cleanup);

const renderText = (
  value: LocalizedString,
  localization: CurrentProtocol['localization'],
  Text: typeof SummaryText = SummaryText,
) => {
  const protocol: CurrentProtocol = {
    name: 'Study',
    schemaVersion: 9,
    localization,
    assetManifest: {},
    codebook: {},
    stages: [],
  };
  return render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Text value={value} />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
};

const languageNames = () =>
  screen.getAllByRole('term').map((term) => term.firstChild?.textContent);

describe('protocol text in the printable summary', () => {
  it('lists the text in every protocol language, alphabetically by name, marking the default', () => {
    renderText(
      { de: 'Hallo', en: 'Hello', fr: 'Bonjour' },
      { defaultLocale: 'fr', locales: ['fr', 'de', 'en'] },
    );

    expect(languageNames()).toEqual(['English', 'French', 'German']);
    expect(
      screen
        .getAllByRole('term')
        .map((term) => within(term).queryByText('Default') !== null),
    ).toEqual([false, true, false]);
    expect(
      screen.getAllByRole('definition').map((text) => text.textContent),
    ).toEqual(['Hello', 'Bonjour', 'Hallo']);
  });

  it('marks each translation with its language and direction', () => {
    renderText(
      { ar: 'مرحبا', en: 'Hello' },
      { defaultLocale: 'en', locales: ['en', 'ar'] },
    );

    expect(screen.getByText('مرحبا')).toHaveAttribute('lang', 'ar');
    expect(screen.getByText('مرحبا')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('Hello')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Hello')).toHaveAttribute('dir', 'ltr');
  });

  it('names the only language a text is written in as the one participants see', () => {
    renderText({ en: 'Hello' }, { defaultLocale: 'en', locales: ['en', 'fr'] });

    const note = screen.getByText(
      'Not translated yet. Participants see the English text.',
    );
    // The note is in Architect's language, not the missing translation's.
    expect(note.closest('dd')).not.toHaveAttribute('lang');
  });

  it('says when the language participants see depends on their browser', () => {
    renderText(
      { en: 'Hello', fr: 'Bonjour' },
      { defaultLocale: 'en', locales: ['de', 'en', 'fr'] },
    );

    expect(
      screen.getByText(
        'Not translated yet. Participants see the English text, unless their browser also lists a language that has it.',
      ),
    ).toBeVisible();
  });

  it('prints the text plainly, marked with its language, in a protocol with one language', () => {
    renderText({ en: 'Hello' }, { defaultLocale: 'en', locales: ['en'] });

    expect(screen.queryByRole('term')).toBeNull();
    expect(screen.queryByText('Default')).toBeNull();
    expect(screen.getByText('Hello')).toHaveAttribute('lang', 'en');
  });

  it('prints the text plainly in a protocol whose language is unspecified', () => {
    renderText({ und: 'Hello' }, { defaultLocale: 'und', locales: ['und'] });

    expect(screen.queryByRole('term')).toBeNull();
    expect(screen.queryByText('Unspecified language')).toBeNull();
    expect(screen.getByText('Hello')).toHaveAttribute('lang', 'und');
  });

  it('renders markdown in every language', () => {
    renderText(
      { en: '**Welcome**', fr: '**Bienvenue**' },
      { defaultLocale: 'en', locales: ['en', 'fr'] },
      SummaryMarkdown,
    );

    for (const [text, lang] of Object.entries({
      Welcome: 'en',
      Bienvenue: 'fr',
    })) {
      const strong = screen.getByText(text);
      expect(strong.tagName).toBe('STRONG');
      expect(strong.closest('[lang]')).toHaveAttribute('lang', lang);
    }
  });
});
