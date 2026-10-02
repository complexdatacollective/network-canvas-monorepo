import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { stageMessages } from '../events';
import { networkExporterCatalogs } from '../locales/catalogs';
import { exportStageMessages, formatExportWarnings } from '../messages';
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

describe('the warnings shown after an export', () => {
  const intl = createAppIntl({ locale: 'en' });
  const answers = (
    overrides: Partial<
      Extract<ExportWarning, { kind: 'xml-illegal-characters' }>
    >,
  ): ExportWarning => ({
    kind: 'xml-illegal-characters',
    sessionId: 'session-1',
    caseId: 'P-7',
    variables: [],
    caseIdChanged: false,
    ...overrides,
  });
  const renamed = (
    overrides: Partial<Extract<ExportWarning, { kind: 'column-renamed' }>>,
  ): ExportWarning => ({
    kind: 'column-renamed',
    protocolName: 'Friendship study',
    format: 'csv',
    entity: 'node',
    entityTypeName: 'Person',
    variable: 'nodeID',
    column: 'nodeID',
    renamedTo: 'nodeID_2',
    ...overrides,
  });
  const protocolText = (
    text: Extract<
      ExportWarning,
      { kind: 'xml-illegal-characters-in-protocol' }
    >['text'],
    original: string,
  ): ExportWarning => ({
    kind: 'xml-illegal-characters-in-protocol',
    protocolName: 'Friendship study',
    text,
    original,
  });
  const itemsOf = (warnings: ExportWarning[]) =>
    formatExportWarnings(intl, warnings).flatMap(({ items }) =>
      items.map(({ text }) => text),
    );

  it('shows nothing when there are no warnings', () => {
    expect(formatExportWarnings(intl, [])).toEqual([]);
  });

  it('gives each kind of warning its own heading and explanation, in a fixed order', () => {
    const groups = formatExportWarnings(intl, [
      renamed({}),
      protocolText('protocol-name', 'Friendship study'),
      answers({ variables: ['Nickname'] }),
    ]);

    expect(groups.map(({ kind, title }) => [kind, title])).toEqual([
      [
        'xml-illegal-characters',
        'Some characters were removed from the GraphML files',
      ],
      [
        'xml-illegal-characters-in-protocol',
        'Some characters were removed from protocol text in the GraphML files',
      ],
      ['column-renamed', 'Some columns were given new names'],
    ]);
    expect(groups[0]?.description).toContain('GraphML files only');
    expect(groups[0]?.description).toContain(
      'CSV files keep every answer unchanged',
    );
    expect(groups[2]?.description).toContain('no answers are lost');
  });

  it('lists a warning that several interviews gave once', () => {
    const groups = formatExportWarnings(intl, [
      renamed({}),
      renamed({}),
      answers({ variables: ['Nickname'] }),
      answers({ sessionId: 'session-2', variables: ['Nickname'] }),
    ]);

    const keys = groups.flatMap(({ items }) => items.map(({ key }) => key));
    expect(groups.map(({ items }) => items.length)).toEqual([2, 1]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe('for answers that lost characters', () => {
    it('names each interview and the variables whose answers changed', () => {
      expect(
        itemsOf([
          answers({ variables: ['Nickname'] }),
          answers({ caseId: 'P-8', variables: ['Nickname', 'Notes'] }),
          answers({ caseId: 'P-9', variables: ['Nickname', 'Notes', 'Town'] }),
        ]),
      ).toEqual([
        'Interview P-7: Nickname',
        'Interview P-8: Nickname and Notes',
        'Interview P-9: Nickname, Notes, and Town',
      ]);
    });

    it('lists the case ID among them when it changed', () => {
      expect(
        itemsOf([answers({ variables: ['Nickname'], caseIdChanged: true })]),
      ).toEqual(['Interview P-7: Case ID and Nickname']);
    });

    it('names an interview with no case ID by its session', () => {
      expect(
        itemsOf([answers({ caseId: '', variables: ['Nickname'] })]),
      ).toEqual(['Interview session-1: Nickname']);
    });

    it('keeps variable names in any script exactly as written', () => {
      expect(
        itemsOf([
          answers({ variables: ['ニックネーム', 'Eye colour, "natural"'] }),
        ]),
      ).toEqual(['Interview P-7: ニックネーム and Eye colour, "natural"']);
    });
  });

  it('says which of the protocol’s text lost characters', () => {
    expect(
      itemsOf([
        protocolText('protocol-name', 'Friendship\u0001 study'),
        protocolText('node-type-name', 'Per\u0001son'),
        protocolText('edge-type-name', 'Kn\u0001ows'),
        protocolText('column-name', 'Nick\u0001name'),
      ]),
    ).toEqual([
      'The protocol name “Friendship\u0001 study”',
      'The node type name “Per\u0001son” in Friendship study',
      'The edge type name “Kn\u0001ows” in Friendship study',
      'The column name “Nick\u0001name” in Friendship study',
    ]);
  });

  it('says what each renamed column was written as, and where', () => {
    expect(
      itemsOf([
        renamed({}),
        renamed({
          format: 'graphml',
          variable: 'Colour',
          column: 'Colour_red',
          renamedTo: 'Colour_red_2',
        }),
        {
          kind: 'column-renamed',
          protocolName: 'Friendship study',
          format: 'csv',
          entity: 'ego',
          variable: 'networkCanvasCaseID',
          column: 'networkCanvasCaseID',
          renamedTo: 'networkCanvasCaseID_2',
        },
      ]),
    ).toEqual([
      'In the CSV files of Friendship study, the Person column “nodeID” was written as “nodeID_2”.',
      'In the GraphML files of Friendship study, the Person column “Colour_red”, from the variable Colour, was written as “Colour_red_2”.',
      'In the CSV files of Friendship study, the ego column “networkCanvasCaseID” was written as “networkCanvasCaseID_2”.',
    ]);
  });
});
