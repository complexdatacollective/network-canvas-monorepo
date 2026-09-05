import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
  type ExtractedCatalog,
} from '@codaco/app-i18n/catalog-guards';
import { commonMessages } from '@codaco/app-i18n/common';
import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';
import enGb from '~/src/locales/en-GB.json';
import es from '~/src/locales/es.json';

const root = resolve(import.meta.dirname, '../../..');
const sourceDirectories = [
  'actions',
  'app',
  'components',
  'hooks',
  'i18n',
  'schemas',
  'utils',
];
const en = JSON.parse(
  readFileSync(resolve(root, 'src/locales/en.json'), 'utf8'),
) as ExtractedCatalog;

describe('Fresco researcher message catalogs', () => {
  it('extracts all researcher source directories without stale, missing, or duplicate descriptors', async () => {
    const extracted = await extractMessages(
      sourceDirectories.flatMap((directory) =>
        collectSourceFiles(resolve(root, directory)),
      ),
    );
    expect(checkCatalogFreshness(en, extracted)).toEqual([]);
    expect(Object.keys(extracted).length).toBeGreaterThan(700);
    for (const id of Object.keys(extracted)) expect(id).toMatch(/^fresco\./);
  });

  it('advertises only explicitly translated ecosystem locales', () => {
    expect(frescoLocales.map(({ locale }) => locale)).toEqual([
      'en',
      'en-GB',
      'es',
    ]);
    for (const { locale } of frescoLocales) {
      expect(ecosystemLocales.map((entry) => entry.locale)).toContain(locale);
      expect(Object.keys(frescoCatalogs)).toContain(locale);
    }
  });

  it('requires complete Spanish and matching ICU arguments and rich text tags', () => {
    expect(checkFullLocale(en, es)).toEqual([]);
  });

  it('keeps British English sparse with only reviewed differences', () => {
    expect(checkOverrideLocale(en, enGb)).toEqual([]);
    expect(Object.keys(enGb).length).toBeGreaterThan(0);
    expect(Object.keys(enGb).length).toBeLessThan(Object.keys(en).length);
    for (const [id, message] of Object.entries(enGb))
      expect(message).not.toBe(en[id]?.defaultMessage);
  });

  it('renders app and common Spanish through the merged production catalog', () => {
    const intl = createAppIntl({ locale: 'es', messages: frescoCatalogs.es });
    expect(
      intl.formatMessage({
        id: 'fresco.language.label',
        defaultMessage: 'Language',
        description: 'Application language preference label.',
      }),
    ).toBe('Idioma');
    expect(intl.formatMessage(commonMessages.cancel)).toBe('Cancelar');
  });

  it('uses the independently reviewed Spanish singular and plural count forms', () => {
    const intl = createAppIntl({ locale: 'es', messages: frescoCatalogs.es });
    const interviewCounts = en['fresco.participants.table.interviewCounts'];
    const generated =
      en['fresco.settings.SyntheticInterviewDataSection.interviewsGenerated'];
    if (!interviewCounts || !generated)
      throw new Error('Expected extracted count messages');
    const countMessage = {
      ...interviewCounts,
      id: 'fresco.participants.table.interviewCounts',
    };
    const generatedMessage = {
      ...generated,
      id: 'fresco.settings.SyntheticInterviewDataSection.interviewsGenerated',
    };
    expect(intl.formatMessage(countMessage, { total: 1, completed: 1 })).toBe(
      '1 (1 completada)',
    );
    expect(intl.formatMessage(countMessage, { total: 2, completed: 2 })).toBe(
      '2 (2 completadas)',
    );
    expect(intl.formatMessage(generatedMessage, { value1: 1, value2: 1 })).toBe(
      '1 / 1 entrevista generada',
    );
    expect(intl.formatMessage(generatedMessage, { value1: 2, value2: 2 })).toBe(
      '2 / 2 entrevistas generadas',
    );
  });

  it('formats British overrides and source fallbacks in the selected locale', () => {
    const intl = createAppIntl({
      locale: 'en-GB',
      messages: frescoCatalogs['en-GB'],
    });
    expect(
      intl.formatMessage({
        id: 'fresco.actions.auth.copyUnauthorized',
        defaultMessage: 'Unauthorized',
        description: 'Authentication error returned by the action.',
      }),
    ).toBe('Unauthorised');
    expect(
      intl.formatMessage({
        id: 'fresco.language.label',
        defaultMessage: 'Language',
        description: 'Application language preference label.',
      }),
    ).toBe('Language');
  });
});
