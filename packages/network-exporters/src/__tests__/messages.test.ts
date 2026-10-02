import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { stageMessages } from '../events';
import { networkExporterCatalogs } from '../locales/catalogs';
import {
  exportStageMessages,
  exportWarningMessages,
  formatXmlCharacterWarnings,
} from '../messages';
import type { ExportWarning } from '../output';

describe('export stage presentation', () => {
  it('preserves the worker diagnostic English without requiring localization in the worker', () => {
    const intl = createAppIntl({ locale: 'en' });
    expect(Object.keys(exportStageMessages)).toEqual(
      Object.keys(stageMessages),
    );
    for (const [stage, descriptor] of Object.entries(exportStageMessages)) {
      expect(intl.formatMessage(descriptor)).toBe(
        stageMessages[stage as keyof typeof stageMessages],
      );
    }
  });

  it('formats the same stage identity in the current reader language', () => {
    const english = createAppIntl({ locale: 'en' });
    const spanish = createAppIntl({
      locale: 'es',
      messages: networkExporterCatalogs.es,
    });
    expect(english.formatMessage(exportStageMessages.generating)).toBe(
      'Generating files...',
    );
    expect(spanish.formatMessage(exportStageMessages.generating)).toBe(
      'Generando archivos…',
    );
    expect(stageMessages.generating).toBe('Generating files...');
  });
});

describe('the warning about characters removed from GraphML files', () => {
  const intl = createAppIntl({ locale: 'en' });
  const warning = (overrides: Partial<ExportWarning>): ExportWarning => ({
    kind: 'xml-illegal-characters',
    sessionId: 'session-1',
    caseId: 'P-7',
    variables: [],
    caseIdChanged: false,
    ...overrides,
  });

  it('names each interview and the variables whose answers changed', () => {
    expect(
      formatXmlCharacterWarnings(intl, [
        warning({ variables: ['Nickname'] }),
        warning({ caseId: 'P-8', variables: ['Nickname', 'Notes'] }),
        warning({ caseId: 'P-9', variables: ['Nickname', 'Notes', 'Town'] }),
      ]),
    ).toEqual([
      'Interview P-7: Nickname',
      'Interview P-8: Nickname and Notes',
      'Interview P-9: Nickname, Notes, and Town',
    ]);
  });

  it('lists the case ID among them when it changed', () => {
    expect(
      formatXmlCharacterWarnings(intl, [
        warning({ variables: ['Nickname'], caseIdChanged: true }),
      ]),
    ).toEqual(['Interview P-7: Case ID and Nickname']);
  });

  it('names an interview with no case ID by its session', () => {
    expect(
      formatXmlCharacterWarnings(intl, [
        warning({ caseId: '', variables: ['Nickname'] }),
      ]),
    ).toEqual(['Interview session-1: Nickname']);
  });

  it('keeps variable names in any script exactly as written', () => {
    expect(
      formatXmlCharacterWarnings(intl, [
        warning({ variables: ['ニックネーム', 'Eye colour, "natural"'] }),
      ]),
    ).toEqual(['Interview P-7: ニックネーム and Eye colour, "natural"']);
  });

  it('says the CSV files are unchanged', () => {
    const description = intl.formatMessage(
      exportWarningMessages.xmlCharactersDescription,
    );

    expect(description).toContain('GraphML files only');
    expect(description).toContain('CSV files keep every answer unchanged');
  });
});
