import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { familyPedigreeWordingIn } from '../stage-wording/family-pedigree.ts';
import {
  inapplicableStageSettings,
  missingSuppliedStageText,
  suppliedStageSettingApplies,
  suppliedStageText,
  suppliedStageTextAfterLanguageChange,
} from '../supplied-stage-text.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const english = { defaultLocale: 'en', locales: ['en'] };

/** The roster's panel title, of the settings the roster is supplied. */
const panelTitleOnly = (text: { path: readonly string[] }) =>
  text.path[0] === 'panelTitle';

describe('the roster panel title Network Canvas supplies', () => {
  it('is written in each protocol language it is supplied in', () => {
    expect(
      suppliedStageText('NameGeneratorRoster', {
        defaultLocale: 'en-GB',
        locales: ['en-GB', 'es', 'hu'],
      }).filter(panelTitleOnly),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { 'en-GB': 'Available to add', 'es': 'Disponibles para añadir' },
      },
    ]);
  });

  // It is required, so a default language Network Canvas has no wording for
  // holds the English text, as the Family Pedigree's option labels do.
  it('is written in English in a default language it is not supplied in', () => {
    expect(
      suppliedStageText('NameGeneratorRoster', {
        defaultLocale: 'hu',
        locales: ['hu', 'fr'],
      }).filter(panelTitleOnly),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { hu: 'Available to add', fr: 'Éléments disponibles' },
      },
    ]);
  });

  it('is supplied for no other stage', () => {
    expect(
      suppliedStageText('NameGenerator', english).filter(panelTitleOnly),
    ).toEqual([]);
  });

  const roster = (panelTitle: Record<string, string>) => ({
    type: 'NameGeneratorRoster',
    panelTitle,
  });

  it('is filled into a new language while it is still the supplied text in the default language', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'fr'] },
      }),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { en: 'Available to add', fr: 'Éléments disponibles' },
      },
    ]);
  });

  it('becomes the corrected language’s text when the language is corrected', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: english,
        after: { defaultLocale: 'de', locales: ['de'] },
        renamed: { en: 'de' },
      }),
    ).toEqual([
      { path: ['panelTitle'], value: { de: 'Zum Hinzufügen verfügbar' } },
    ]);
  });

  it('stays in English when its only language is corrected to one it is not supplied in', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: english,
        after: { defaultLocale: 'hu', locales: ['hu'] },
        renamed: { en: 'hu' },
      }),
    ).toEqual([{ path: ['panelTitle'], value: { hu: 'Available to add' } }]);
  });

  it('stays in English in a new default language it is not supplied in when the old one is removed', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: { defaultLocale: 'en', locales: ['en', 'hu'] },
        after: { defaultLocale: 'hu', locales: ['hu'] },
      }),
    ).toEqual([{ path: ['panelTitle'], value: { hu: 'Available to add' } }]);
  });

  it('is still Network Canvas’s when a default language it is not supplied in holds the English text', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ hu: 'Available to add' }), {
        before: { defaultLocale: 'hu', locales: ['hu'] },
        after: { defaultLocale: 'hu', locales: ['hu', 'fr'] },
      }),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { hu: 'Available to add', fr: 'Éléments disponibles' },
      },
    ]);
  });

  it('is the researcher’s once they have reworded it', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Services' }), {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'fr'] },
      }),
    ).toEqual([]);
  });
});

describe('migrating a roster stage to schema 9', () => {
  const rosterOf = (protocol: { stages: readonly unknown[] }) =>
    protocol.stages.find(
      (stage) => (stage as { type?: unknown }).type === 'NameGeneratorRoster',
    ) as Record<string, unknown> | undefined;

  it('gives a schema 8 roster the heading the interview has always shown, in English', () => {
    const document = asSchema8Protocol(completeProtocol());
    delete rosterOf(document)!.panelTitle;
    const migrated = migrateProtocol(document, 9);
    expect(rosterOf(migrated)).toMatchObject({
      panelTitle: {
        [migrated.localization.defaultLocale]: 'Available to add',
      },
    });
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  // Fresco's deploy normalization re-runs this migration over rows already
  // stored at schema 9.
  it('gives a schema 9 roster without one the supplied text in its own languages, and keeps one it has', () => {
    const document = {
      ...completeProtocol(),
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'de'] },
    };
    const untitled = structuredClone(document);
    delete rosterOf(untitled)!.panelTitle;
    expect(rosterOf(migrateProtocol(untitled, 9))).toMatchObject({
      panelTitle: {
        en: 'Available to add',
        de: 'Zum Hinzufügen verfügbar',
      },
    });
    const titled = structuredClone(document);
    Object.assign(rosterOf(titled)!, { panelTitle: { en: 'Services' } });
    expect(rosterOf(migrateProtocol(titled, 9))).toMatchObject({
      panelTitle: { en: 'Services' },
    });
  });
});

describe('the Family Pedigree wording Network Canvas supplies', () => {
  const paths = (stage: Record<string, unknown>) =>
    missingSuppliedStageText(
      { type: 'FamilyPedigree', ...stage },
      { defaultLocale: 'en', locales: ['en', 'de'] },
    ).map(({ path }) => path.join('.'));

  // The wording a stage holds only while its configuration is on: the framing
  // question while participants choose the words, the gender identity
  // question while the stage asks about gender identity, and the note on a
  // question limited to one sex at birth while it has one.
  const CONFIGURED = [
    'framingChoiceTitle',
    'framingChoiceDescription',
    'framingControlLabel',
    'genderIdentityLabel',
    'nominationLimitHint',
  ];
  const alwaysWording = Object.keys(familyPedigreeWordingIn())
    .filter((key) => !CONFIGURED.includes(key))
    .map((key) => `wording.${key}`);

  it('gives a new stage its name question and its wording, and no tracker wording until it has a tracker', () => {
    expect(paths({})).toEqual([
      'nodeConfiguration.nameField.prompt',
      'nodeConfiguration.nameField.hint',
      ...alwaysWording,
    ]);
  });

  it('gives a stage with a tracker all of its wording', () => {
    expect(
      paths({
        nodeConfiguration: { nameField: { prompt: { en: 'Name' } } },
        completeness: { scope: 'parents' },
      }),
    ).toEqual([
      'completeness.itemText.parents.listItem',
      'completeness.itemText.siblings.listItem',
      'completeness.itemText.siblings.noneButton',
      'completeness.itemText.siblings.question',
      'completeness.itemText.children.listItem',
      'completeness.itemText.children.noneButton',
      'completeness.itemText.children.question',
      'completeness.itemText.details.listItem',
      'completeness.recommendedNote',
      ...alwaysWording,
    ]);
  });

  it('does not put back a hint the researcher removed', () => {
    expect(
      paths({ nodeConfiguration: { nameField: { prompt: { en: 'Name' } } } }),
    ).toEqual(alwaysWording);
  });

  it('gives a stage the note on a question limited to one sex at birth only while it has one', () => {
    const named = {
      nodeConfiguration: { nameField: { prompt: { en: 'Name' } } },
    };
    expect(
      paths({
        ...named,
        nominationPrompts: [{ id: 'smokes', attribute: 'smokes' }],
      }),
    ).not.toContain('wording.nominationLimitHint');
    expect(
      paths({
        ...named,
        nominationPrompts: [
          { id: 'smokes', attribute: 'smokes' },
          {
            id: 'pregnant',
            attribute: 'pregnant',
            onlyForSexAssignedAtBirth: 'female',
          },
        ],
      }),
    ).toContain('wording.nominationLimitHint');
  });

  it('writes the wording with its arguments, in each language it is supplied in', () => {
    const stage = {
      type: 'FamilyPedigree',
      completeness: {},
      nodeConfiguration: { nameField: { prompt: {} } },
    };
    const [parents] = missingSuppliedStageText(stage, {
      defaultLocale: 'en',
      locales: ['en', 'zh-Hans'],
    });
    expect(parents?.value['zh-Hans']).toContain('{isYou, select,');
    expect(parents?.value.en).toContain('{name}');
  });

  it('follows a language change while the default language still has it', () => {
    const stage = {
      type: 'FamilyPedigree',
      completeness: {
        recommendedNote: {
          en: 'You can also continue without these by pressing Next again.',
        },
      },
    };
    expect(
      suppliedStageTextAfterLanguageChange(stage, {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'fr'] },
      }),
    ).toEqual([
      {
        path: ['completeness', 'recommendedNote'],
        value: {
          en: 'You can also continue without these by pressing Next again.',
          fr: expect.stringContaining('Suivant') as unknown as string,
        },
      },
    ]);
  });
});

describe('which supplied settings apply to a stage', () => {
  it('applies a setting with no condition to every stage of its type', () => {
    expect(
      suppliedStageSettingApplies({ type: 'NetworkComposer' }, [
        'addNamePlaceholder',
      ]),
    ).toBe(true);
  });

  it('applies a Network Composer groups heading only once the stage has groups', () => {
    expect(
      suppliedStageSettingApplies({ type: 'NetworkComposer' }, [
        'groupsHeading',
      ]),
    ).toBe(false);
    expect(
      suppliedStageSettingApplies(
        { type: 'NetworkComposer', convexHullVariable: 'contactType' },
        ['groupsHeading'],
      ),
    ).toBe(true);
  });

  it('applies a layout tooltip only while the stage’s automatic layout is on', () => {
    const path = ['tooltips', 'pauseLayout'];
    expect(
      suppliedStageSettingApplies(
        { type: 'Sociogram', behaviours: { automaticLayout: true } },
        path,
      ),
    ).toBe(true);
    expect(
      suppliedStageSettingApplies(
        { type: 'Sociogram', behaviours: { automaticLayout: false } },
        path,
      ),
    ).toBe(false);
  });

  it('applies an at-risk notation only when the Narrative Pedigree shows at-risk statuses', () => {
    const path = ['conditionText', 'notation', 'atRiskAffected'];
    expect(
      suppliedStageSettingApplies(
        { type: 'NarrativePedigree', showAtRiskStatuses: false },
        path,
      ),
    ).toBe(false);
    expect(
      suppliedStageSettingApplies(
        { type: 'NarrativePedigree', showAtRiskStatuses: true },
        path,
      ),
    ).toBe(true);
  });

  it('applies nothing to a path the stage type does not supply', () => {
    expect(
      suppliedStageSettingApplies({ type: 'Sociogram' }, ['noSuchSetting']),
    ).toBe(false);
  });
});

describe('the settings a stage holds but no longer shows', () => {
  const tooltips = {
    pauseLayout: { en: 'Pause' },
    resumeLayout: { en: 'Resume' },
  };

  it('are the conditional ones whose configuration is off', () => {
    expect(
      inapplicableStageSettings({
        type: 'Sociogram',
        behaviours: { automaticLayout: false },
        tooltips,
      }),
    ).toEqual([
      ['tooltips', 'pauseLayout'],
      ['tooltips', 'resumeLayout'],
    ]);
  });

  it('leave out a setting whose configuration is on, or one the stage lacks', () => {
    expect(
      inapplicableStageSettings({
        type: 'Sociogram',
        behaviours: { automaticLayout: true },
        tooltips,
      }),
    ).toEqual([]);
    expect(
      inapplicableStageSettings({
        type: 'Sociogram',
        behaviours: { automaticLayout: false },
      }),
    ).toEqual([]);
  });
});
