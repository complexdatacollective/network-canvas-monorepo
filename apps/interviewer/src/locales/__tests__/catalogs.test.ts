import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
} from '@codaco/app-i18n/catalog-guards';
import type { ExtractedCatalog } from '@codaco/app-i18n/catalog-guards';
import { commonMessages } from '@codaco/app-i18n/common';
import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';

import { interviewerProductionLocales } from '../../i18n/locales';
import { buildDeleteProtocolMessage } from '../../routes/deleteProtocolMessage';
import { interviewerCatalogs } from '../catalogs';
import enGb from '../en-GB.json';
import es from '../es.json';

const src = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = JSON.parse(
  readFileSync(join(src, 'locales/en.json'), 'utf8'),
) as ExtractedCatalog;

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
    expect(checkFullLocale(source, es)).toEqual([]);
  });
  it('ships only reviewed British differences and inherits the English base', () => {
    expect(checkOverrideLocale(source, enGb)).toEqual([]);
    expect(Object.keys(enGb).length).toBeGreaterThan(0);
    expect(Object.keys(enGb).length).toBeLessThan(Object.keys(source).length);
    for (const [id, value] of Object.entries(enGb))
      expect(value).not.toBe(source[id]?.defaultMessage);
    const intl = createAppIntl({
      locale: 'en-GB',
      messages: interviewerCatalogs['en-GB'],
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
    ]);
    for (const entry of interviewerProductionLocales)
      expect(
        ecosystemLocales.find(({ locale }) => locale === entry.locale),
      ).toEqual(entry);
  });
  it('renders Spanish counts, deletion consequences, and shared controls', () => {
    const intl = createAppIntl({
      locale: 'es',
      messages: interviewerCatalogs.es,
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
  it('formats large stage totals, missing totals and singular generation progress', () => {
    const intl = createAppIntl({
      locale: 'es',
      messages: interviewerCatalogs.es,
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
