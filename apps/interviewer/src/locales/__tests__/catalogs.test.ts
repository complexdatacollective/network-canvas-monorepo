import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkCatalogLoaders,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
  readTranslationSources,
} from '@codaco/app-i18n/catalog-guards';
import type { ExtractedCatalog } from '@codaco/app-i18n/catalog-guards';
import { commonMessages } from '@codaco/app-i18n/common';
import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';

import { interviewerProductionLocales } from '../../i18n/locales';
import { buildDeleteProtocolMessage } from '../../routes/deleteProtocolMessage';
import {
  interviewerCatalogLoaders,
  interviewerCatalogSource,
} from '../catalogs';
import de from '../de.json';
import enGb from '../en-GB.json';
import es from '../es.json';
import fr from '../fr.json';
import italian from '../it.json';
import nl from '../nl.json';
import ptBR from '../pt-BR.json';
import zhHans from '../zh-Hans.json';
import zhHant from '../zh-Hant.json';

const src = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = JSON.parse(
  readFileSync(join(src, 'locales/en.json'), 'utf8'),
) as ExtractedCatalog;
const localesDir = join(src, 'locales');
const esSources = readTranslationSources(localesDir, 'es');
const zhHansSources = readTranslationSources(localesDir, 'zh-Hans');
const zhHantSources = readTranslationSources(localesDir, 'zh-Hant');
const deSources = readTranslationSources(localesDir, 'de');
const nlSources = readTranslationSources(localesDir, 'nl');
const ptBRSources = readTranslationSources(localesDir, 'pt-BR');
const italianSources = readTranslationSources(localesDir, 'it');
const frSources = readTranslationSources(localesDir, 'fr');
const enGbSources = readTranslationSources(localesDir, 'en-GB');

describe('the complete administration catalog', () => {
  it('extracts every live descriptor, with translator context and app ownership', async () => {
    const extracted = await extractMessages(collectSourceFiles(src));
    expect(Object.keys(extracted).length).toBeGreaterThan(420);
    expect(checkCatalogFreshness(source, extracted)).toEqual([]);
    for (const [id, entry] of Object.entries(extracted)) {
      expect(id).toMatch(/^interviewer\./);
      expect(entry.description.trim().length).toBeGreaterThan(15);
    }
  });
  it('ships full Spanish with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, es, esSources)).toEqual([]);
  });
  it('ships full Simplified Chinese with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, zhHans, zhHansSources)).toEqual([]);
  });
  it('ships full Traditional Chinese with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, zhHant, zhHantSources)).toEqual([]);
  });

  it('ships full German with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, de, deSources)).toEqual([]);
  });

  it('ships full Dutch with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, nl, nlSources)).toEqual([]);
  });

  it('ships full Brazilian Portuguese with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, ptBR, ptBRSources)).toEqual([]);
  });

  it('ships full Italian with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, italian, italianSources)).toEqual([]);
  });

  it('ships full French with valid ICU and identical placeholder semantics', () => {
    expect(checkFullLocale(source, fr, frSources)).toEqual([]);
  });
  it('loads each committed catalog through its own locale loader', async () => {
    expect(
      await checkCatalogLoaders(localesDir, interviewerCatalogLoaders),
    ).toEqual([]);
  });
  it('ships only reviewed British differences and inherits the English base', async () => {
    expect(checkOverrideLocale(source, enGb, enGbSources)).toEqual([]);
    expect(Object.keys(enGb).length).toBeGreaterThan(0);
    expect(Object.keys(enGb).length).toBeLessThan(Object.keys(source).length);
    for (const [id, value] of Object.entries(enGb))
      expect(value).not.toBe(source[id]?.defaultMessage);
    const intl = createAppIntl({
      locale: 'en-GB',
      messages: await interviewerCatalogSource.load('en-GB'),
    });
    expect(
      intl.formatMessage({
        id: 'interviewer.setupWizardDialog.lockBehavior',
        defaultMessage: 'Lock behavior',
        description:
          'Lock behavior settings heading rendered in British English.',
      }),
    ).toBe('Lock behaviour');
    expect(intl.formatMessage(commonMessages.cancel)).toBe('Cancel');
  });
  it('advertises exactly the delivered production subset of the ecosystem', () => {
    expect(interviewerProductionLocales.map(({ locale }) => locale)).toEqual([
      'en',
      'en-GB',
      'es',
      'zh-Hans',
      'zh-Hant',
      'de',
      'nl',
      'pt-BR',
      'it',
      'fr',
    ]);
    for (const entry of interviewerProductionLocales)
      expect(
        ecosystemLocales.find(({ locale }) => locale === entry.locale),
      ).toEqual(entry);
  });
  it('renders Spanish counts, deletion consequences, and shared controls', async () => {
    const intl = createAppIntl({
      locale: 'es',
      messages: await interviewerCatalogSource.load('es'),
    });
    const countMessage = {
      id: 'interviewer.deckCard.interviewCount',
      defaultMessage: '{count, plural, one {# interview} other {# interviews}}',
    };
    expect(intl.formatMessage(countMessage, { count: 1 })).toBe('1 entrevista');
    expect(intl.formatMessage(countMessage, { count: 2 })).toBe(
      '2 entrevistas',
    );
    const deletion = buildDeleteProtocolMessage('Estudio A', []).description;
    expect(intl.formatMessage(deletion.descriptor, deletion.values)).toContain(
      '«Estudio A»',
    );
    expect(intl.formatMessage(commonMessages.cancel)).toBe('Cancelar');
  });
  it('formats large stage totals, missing totals and singular generation progress', async () => {
    const intl = createAppIntl({
      locale: 'es',
      messages: await interviewerCatalogSource.load('es'),
    });
    const stage = { id: 'interviewer.dataViewColumns.stepProgress' };
    expect(
      intl.formatMessage(stage, { step: 1, total: 10000, hasTotal: 'true' }),
    ).toBe('paso 1 de 10.000');
    expect(
      intl.formatMessage(stage, { step: 1, total: 0, hasTotal: 'false' }),
    ).toBe('paso 1 de ?');
    const progress = {
      id: 'interviewer.settingsDialog.currentTotalInterviewsGenerated',
    };
    expect(intl.formatMessage(progress, { current: 1, total: 1 })).toBe(
      '1 / 1 entrevista generada',
    );
    expect(intl.formatMessage(progress, { current: 1, total: 2 })).toBe(
      '1 / 2 entrevistas generadas',
    );
  });
});
