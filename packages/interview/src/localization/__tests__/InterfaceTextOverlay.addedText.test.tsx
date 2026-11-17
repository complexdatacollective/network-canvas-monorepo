import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  getLocaleMetadata,
  type LocalizationDeclaration,
} from '@codaco/protocol-validation';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import type { AddedTextCatalogues } from '../../wording/addedText';
import { InterfaceTextOverlay } from '../InterfaceTextOverlay';
import { ProtocolLocalizationProvider } from '../ProtocolLocalizationProvider';

// A message a correction added: the interview declares it, no protocol can
// hold it, and Network Canvas words it in the languages it supplies. Two of
// them stand for the nine here.
const messages = defineMessages({
  answersKept: {
    id: 'interview.added.answersKept',
    defaultMessage:
      '{count, plural, one {# answer was kept.} other {# answers were kept.}}',
    description: 'Test message standing for text a correction added.',
  },
});

const addedText: AddedTextCatalogues = {
  en: {
    'interview.added.answersKept':
      '{count, plural, one {# answer was kept.} other {# answers were kept.}}',
  },
  es: {
    'interview.added.answersKept':
      '{count, plural, one {Se conservó # respuesta.} other {Se conservaron # respuestas.}}',
  },
  fr: {
    'interview.added.answersKept':
      '{count, plural, one {# réponse a été conservée.} other {# réponses ont été conservées.}}',
  },
};

afterEach(() => {
  document.body.innerHTML = '';
});

function Kept({ count }: { count: number }) {
  const intl = useAppIntl();
  return <p>{intl.formatMessage(messages.answersKept, { count })}</p>;
}

const shownTo = (
  localization: LocalizationDeclaration,
  requestedLocales: readonly string[],
  count = 2,
) => {
  render(
    <InterviewI18nProvider>
      <ProtocolLocalizationProvider
        localization={localization}
        localeOptions={localization.locales.map((locale) =>
          getLocaleMetadata(locale),
        )}
        requestedLocales={requestedLocales}
        localePreference={null}
        onLocalePreferenceChange={vi.fn()}
      >
        {/* The protocol holds this text nowhere: it has no place to. */}
        <InterfaceTextOverlay interfaceText={undefined} addedText={addedText}>
          <Kept count={count} />
        </InterfaceTextOverlay>
      </ProtocolLocalizationProvider>
    </InterviewI18nProvider>,
  );
  return screen.getByRole('paragraph').textContent;
};

describe('text a correction added, which no protocol holds', () => {
  it('is shown in the interview’s language where Network Canvas has wording in it', () => {
    expect(
      shownTo({ defaultLocale: 'en', locales: ['en', 'es'] }, ['es']),
    ).toBe('Se conservaron 2 respuestas.');
  });

  it('follows the plural rules of the language shown', () => {
    expect(
      shownTo({ defaultLocale: 'en', locales: ['en', 'es'] }, ['es'], 1),
    ).toBe('Se conservó 1 respuesta.');
  });

  // Mexican Spanish is not a language Network Canvas writes. The protocol
  // also declares Spanish, the closest related language, so that is shown
  // and the fallback language is not reached.
  it('is shown in the related language the protocol declares, for a regional variant', () => {
    expect(
      shownTo(
        {
          defaultLocale: 'es-MX',
          locales: ['es', 'es-MX'],
          fallbackLocale: 'en',
        },
        ['es-MX'],
      ),
    ).toBe('Se conservaron 2 respuestas.');
  });

  it('is shown in the fallback language for a regional variant declared alone', () => {
    expect(
      shownTo(
        { defaultLocale: 'es-MX', locales: ['es-MX'], fallbackLocale: 'es' },
        ['es-MX'],
      ),
    ).toBe('Se conservaron 2 respuestas.');
  });

  it('is shown in the fallback language where Network Canvas has wording in none of the protocol’s languages', () => {
    expect(
      shownTo({ defaultLocale: 'sw', locales: ['sw'], fallbackLocale: 'fr' }, [
        'sw',
      ]),
    ).toBe('2 réponses ont été conservées.');
  });

  // The protocol also declares Spanish, which nothing says this participant
  // reads: they are shown the fallback language, not Spanish.
  it('is shown in the fallback language rather than another language the protocol declares', () => {
    expect(
      shownTo(
        { defaultLocale: 'sw', locales: ['es', 'sw'], fallbackLocale: 'fr' },
        ['sw'],
      ),
    ).toBe('2 réponses ont été conservées.');
  });

  // Only a protocol still being written, which Architect previews.
  it('keeps the message’s own English for a protocol that needs a fallback language and names none', () => {
    expect(shownTo({ defaultLocale: 'sw', locales: ['sw'] }, ['sw'])).toBe(
      '2 answers were kept.',
    );
  });
});
