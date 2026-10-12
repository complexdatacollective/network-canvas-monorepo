import { describe, expect, it } from 'vitest';

import { interviewCatalogSource, loadInterviewCatalog } from '../catalog';
import { resolveInterviewLocale } from '../locales';

describe('loadInterviewCatalog', () => {
  it.each([
    [['nl-BE'], 'nl'],
    [['ja', 'pt-PT'], 'pt-BR'],
    [[['not_a_locale', 'es-CO']], 'es'],
    [['en-GB', 'fr'], 'fr'],
    [['fr', null], 'fr'],
  ] as const)(
    'loads the language a Shell negotiates from %j',
    async (request, expected) => {
      const catalog = await loadInterviewCatalog(...request);
      expect(catalog.locale).toBe(expected);
      expect(catalog.locale).toBe(resolveInterviewLocale(...request));
    },
  );

  it('merges the shared, design-system and interview messages', async () => {
    const { messages } = await loadInterviewCatalog('nl');
    expect(messages['interview.navigation.nextStep']).toBe('Volgende stap');
    expect(Object.keys(messages).some((id) => id.startsWith('common.'))).toBe(
      true,
    );
    expect(Object.keys(messages).some((id) => id.startsWith('frescoUi.'))).toBe(
      true,
    );
  });

  it('primes the catalog source the Shell renders from', async () => {
    expect(interviewCatalogSource.peek('it')).toBeUndefined();
    const { messages } = await loadInterviewCatalog('it-CH');
    expect(interviewCatalogSource.peek('it')).toBe(messages);
  });

  it('needs no download for English', async () => {
    expect(interviewCatalogSource.peek('en')).toBeDefined();
    expect(await loadInterviewCatalog('en-US')).toEqual({
      locale: 'en',
      messages: {},
    });
  });
});
