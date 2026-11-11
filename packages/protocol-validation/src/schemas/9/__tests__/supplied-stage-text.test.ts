import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { familyPedigreeWordingIn } from '../stage-wording/family-pedigree.ts';
import {
  inapplicableStageSettings,
  missingSuppliedStageText,
  stageWordingShown,
  suppliedStageSettingApplies,
  suppliedStageSettingPaths,
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
        defaultLocale: 'en',
        locales: ['en', 'es', 'hu'],
      }).filter(panelTitleOnly),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { en: 'Available to add', es: 'Disponibles para añadir' },
      },
    ]);
  });

  // Only the exact language is written: a default language Network Canvas
  // has no wording in is left for the researcher to write, with no English
  // in its place.
  it('is not written in a default language it is not supplied in', () => {
    expect(
      suppliedStageText('NameGeneratorRoster', {
        defaultLocale: 'hu',
        locales: ['hu', 'fr'],
      }).filter(panelTitleOnly),
    ).toEqual([
      { path: ['panelTitle'], value: { fr: 'Éléments disponibles' } },
    ]);
  });

  describe('beside a regional variant of a language it is supplied in', () => {
    it('is written in the base language only, which the variant falls back to', () => {
      expect(
        suppliedStageText('NameGeneratorRoster', {
          defaultLocale: 'en',
          locales: ['en', 'es-MX', 'es'],
        }).filter(panelTitleOnly),
      ).toEqual([
        {
          path: ['panelTitle'],
          value: { en: 'Available to add', es: 'Disponibles para añadir' },
        },
      ]);
    });

    it('is still Network Canvas’s in a default language it is not supplied in while that is unwritten', () => {
      const roster = {
        type: 'NameGeneratorRoster',
        panelTitle: { es: 'Disponibles para añadir' },
      };
      expect(
        suppliedStageTextAfterLanguageChange(roster, {
          before: { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] },
          after: { defaultLocale: 'es-MX', locales: ['es-MX', 'es', 'fr'] },
        }),
      ).toEqual([
        {
          path: ['panelTitle'],
          value: { es: 'Disponibles para añadir', fr: 'Éléments disponibles' },
        },
      ]);
    });

    it('is still filled into a new language once the researcher writes it in that default language', () => {
      const roster = {
        type: 'NameGeneratorRoster',
        panelTitle: { 'es-MX': 'Disponibles', 'es': 'Disponibles para añadir' },
      };
      expect(
        suppliedStageTextAfterLanguageChange(roster, {
          before: { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] },
          after: { defaultLocale: 'es-MX', locales: ['es-MX', 'es', 'fr'] },
        }),
      ).toEqual([
        {
          path: ['panelTitle'],
          value: {
            'es-MX': 'Disponibles',
            'es': 'Disponibles para añadir',
            'fr': 'Éléments disponibles',
          },
        },
      ]);
    });
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

  it('is filled into a new language', () => {
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

  it('is left unwritten when its only language is corrected to one it is not supplied in', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: english,
        after: { defaultLocale: 'hu', locales: ['hu'] },
        renamed: { en: 'hu' },
      }),
    ).toEqual([{ path: ['panelTitle'], value: {} }]);
  });

  it('is left unwritten in a new default language it is not supplied in when the old one is removed', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Available to add' }), {
        before: { defaultLocale: 'en', locales: ['en', 'hu'] },
        after: { defaultLocale: 'hu', locales: ['hu'] },
      }),
    ).toEqual([{ path: ['panelTitle'], value: {} }]);
  });

  it('is still Network Canvas’s while a default language it is not supplied in is unwritten', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({}), {
        before: { defaultLocale: 'hu', locales: ['hu'] },
        after: { defaultLocale: 'hu', locales: ['hu', 'fr'] },
      }),
    ).toEqual([
      { path: ['panelTitle'], value: { fr: 'Éléments disponibles' } },
    ]);
  });

  it('is filled into a new language even once the researcher has reworded it in the default language', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Services' }), {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
      }),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: {
          en: 'Services',
          fr: 'Éléments disponibles',
          de: 'Zum Hinzufügen verfügbar',
        },
      },
    ]);
  });

  it('never overwrites a translation', () => {
    // French is the researcher's own; German was written before it was
    // declared, as an open stage editor can hold it.
    expect(
      suppliedStageTextAfterLanguageChange(
        roster({ en: 'Services', fr: 'Nos services', de: 'Dienste' }),
        {
          before: { defaultLocale: 'en', locales: ['en', 'fr'] },
          after: { defaultLocale: 'en', locales: ['en', 'fr', 'de', 'es'] },
        },
      ),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: {
          en: 'Services',
          fr: 'Nos services',
          de: 'Dienste',
          es: 'Disponibles para añadir',
        },
      },
    ]);
  });

  it('moves the researcher’s own translation unchanged to a corrected language', () => {
    expect(
      suppliedStageTextAfterLanguageChange(
        roster({ en: 'Available to add', fr: 'Nos services' }),
        {
          before: { defaultLocale: 'en', locales: ['en', 'fr'] },
          after: { defaultLocale: 'en', locales: ['en', 'de'] },
          renamed: { fr: 'de' },
        },
      ),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { en: 'Available to add', de: 'Nos services' },
      },
    ]);
  });

  it('gains nothing in a new language Network Canvas has no wording in', () => {
    expect(
      suppliedStageTextAfterLanguageChange(roster({ en: 'Services' }), {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'ja', 'fr-CA'] },
      }),
    ).toEqual([{ path: ['panelTitle'], value: { en: 'Services' } }]);
  });

  it('becomes the corrected language’s text where it is Network Canvas’s, even beside reworded text in the default language', () => {
    expect(
      suppliedStageTextAfterLanguageChange(
        roster({ en: 'Services', fr: 'Éléments disponibles' }),
        {
          before: { defaultLocale: 'en', locales: ['en', 'fr'] },
          after: { defaultLocale: 'en', locales: ['en', 'de'] },
          renamed: { fr: 'de' },
        },
      ),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { en: 'Services', de: 'Zum Hinzufügen verfügbar' },
      },
    ]);
  });

  it('fills no gap in a language the protocol already had, as when the default changes or another language is removed', () => {
    const missingFrench = roster({ en: 'Available to add' });
    const both = { defaultLocale: 'en', locales: ['en', 'fr'] };
    expect(
      suppliedStageTextAfterLanguageChange(missingFrench, {
        before: both,
        after: { defaultLocale: 'fr', locales: ['en', 'fr'] },
      }),
    ).toEqual([{ path: ['panelTitle'], value: { en: 'Available to add' } }]);
    expect(
      suppliedStageTextAfterLanguageChange(missingFrench, {
        before: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
        after: both,
      }),
    ).toEqual([{ path: ['panelTitle'], value: { en: 'Available to add' } }]);
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

describe('the Language Chooser heading Network Canvas supplies', () => {
  it('starts a new chooser with the heading in each protocol language it is supplied in', () => {
    expect(
      missingSuppliedStageText(
        { type: 'LanguageChooser' },
        { defaultLocale: 'en', locales: ['en', 'es', 'hu'] },
      ),
    ).toEqual([
      {
        path: ['title'],
        value: { en: 'Choose a language', es: 'Elige un idioma' },
      },
    ]);
  });

  it('keeps a heading the chooser already has', () => {
    const chooser = { type: 'LanguageChooser', title: { en: 'Pick one' } };
    expect(missingSuppliedStageText(chooser, english)).toEqual([]);
  });

  // Schema 8 has no Language Chooser, so only a document already in schema 9
  // form, which Fresco's deploy normalization re-runs this migration over,
  // can hold one without a heading.
  it('is given to a schema 9 chooser without one when the migration re-runs', () => {
    const document = {
      ...completeProtocol(),
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    };
    const chooserOf = (protocol: { stages: readonly unknown[] }) =>
      protocol.stages.find(
        (stage) => (stage as { type?: unknown }).type === 'LanguageChooser',
      ) as Record<string, unknown> | undefined;
    delete chooserOf(document)!.title;
    const migrated = migrateProtocol(document, 9);
    expect(chooserOf(migrated)).toMatchObject({
      title: { en: 'Choose a language', fr: 'Choisissez une langue' },
    });
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
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
  // question while the stage asks about gender identity.
  const CONFIGURED = [
    'framingChoiceTitle',
    'framingChoiceDescription',
    'framingControlLabel',
    'genderIdentityLabel',
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
      suppliedStageSettingApplies({ type: 'NameGeneratorQuickAdd' }, [
        'addNamePlaceholder',
      ]),
    ).toBe(true);
  });

  it('applies a Narrative groups heading only once a preset has groups', () => {
    expect(
      suppliedStageSettingApplies({ type: 'Narrative', presets: [{}] }, [
        'groupsHeading',
      ]),
    ).toBe(false);
    expect(
      suppliedStageSettingApplies(
        { type: 'Narrative', presets: [{ groupVariable: 'contactType' }] },
        ['groupsHeading'],
      ),
    ).toBe(true);
  });

  it('applies a maximum notice only while the stage has a maximum', () => {
    const path = ['maxNodesNotice'];
    expect(
      suppliedStageSettingApplies(
        { type: 'NameGenerator', behaviours: { maxNodes: 3 } },
        path,
      ),
    ).toBe(true);
    expect(
      suppliedStageSettingApplies(
        { type: 'NameGenerator', behaviours: {} },
        path,
      ),
    ).toBe(false);
  });

  it('applies the unplaced notice only while a bin stage requires every node placed', () => {
    const path = ['unplacedNodesNotice'];
    expect(
      suppliedStageSettingApplies(
        {
          type: 'CategoricalBin',
          behaviours: { requireCompletePlacement: false },
        },
        path,
      ),
    ).toBe(false);
    expect(
      suppliedStageSettingApplies(
        {
          type: 'CategoricalBin',
          behaviours: { requireCompletePlacement: true },
        },
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
  const notices = {
    minNodesNotice: { en: 'Add {count, plural, one {# more} other {# more}}' },
    maxNodesNotice: { en: 'That is everyone' },
  };

  it('are the conditional ones whose configuration is off', () => {
    expect(
      inapplicableStageSettings({
        type: 'NameGenerator',
        behaviours: {},
        ...notices,
      }),
    ).toEqual([['minNodesNotice'], ['maxNodesNotice']]);
  });

  it('leave out a setting whose configuration is on, or one the stage lacks', () => {
    expect(
      inapplicableStageSettings({
        type: 'NameGenerator',
        behaviours: { minNodes: 1, maxNodes: 3 },
        ...notices,
      }),
    ).toEqual([]);
    expect(
      inapplicableStageSettings({ type: 'NameGenerator', behaviours: {} }),
    ).toEqual([]);
  });
});

describe('the text the interview shows for a stage', () => {
  const locales = { defaultLocale: 'en', locales: ['en', 'es', 'sw'] };
  const minNotice = (stage: {
    type: string;
    [key: string]: unknown;
  }): ReturnType<typeof stageWordingShown>[number] | undefined =>
    stageWordingShown(stage, locales).find(
      ({ path }) => path.join('.') === 'minNodesNotice',
    );
  const supplied = suppliedStageText('NameGenerator', locales).find(
    ({ path }) => path.join('.') === 'minNodesNotice',
  )?.value;

  it('lists every supplied setting of the stage type, in table order', () => {
    expect(
      stageWordingShown({ type: 'NameGenerator' }, locales).map(
        ({ path }) => path,
      ),
    ).toEqual(suppliedStageSettingPaths('NameGenerator'));
    expect(stageWordingShown({ type: 'Information' }, locales)).toEqual([]);
  });

  it('is Network Canvas’s wording where the stage holds none', () => {
    expect(supplied).toEqual({
      en: expect.any(String),
      es: expect.any(String),
    });
    expect(minNotice({ type: 'NameGenerator' })?.value).toEqual(supplied);
  });

  it('is the stage’s own translation where it holds one, and the rest from Network Canvas', () => {
    const shown = minNotice({
      type: 'NameGenerator',
      minNodesNotice: { en: 'Add more people', sw: 'Ongeza watu' },
    })?.value;

    expect(shown).toEqual({
      en: 'Add more people',
      es: supplied?.es,
      sw: 'Ongeza watu',
    });
  });

  it('is only what the stage holds in a language Network Canvas has no wording in', () => {
    const swahili = { defaultLocale: 'sw', locales: ['sw'] };
    const shownIn = (stage: { type: string; [key: string]: unknown }) =>
      stageWordingShown(stage, swahili).find(
        ({ path }) => path.join('.') === 'minNodesNotice',
      )?.value;

    expect(shownIn({ type: 'NameGenerator' })).toEqual({});
    expect(
      shownIn({ type: 'NameGenerator', minNodesNotice: { sw: 'Ongeza' } }),
    ).toEqual({ sw: 'Ongeza' });
  });

  it('reads anything but an object of text as holding nothing', () => {
    for (const held of ['text', ['en'], null, { en: 3 }]) {
      expect(
        minNotice({ type: 'NameGenerator', minNodesNotice: held })?.value,
      ).toEqual(supplied);
    }
  });

  it('shows a setting with a `when` only while the stage is configured to', () => {
    expect(
      minNotice({ type: 'NameGenerator', behaviours: { minNodes: 2 } })?.shown,
    ).toBe(true);
    expect(
      minNotice({ type: 'NameGenerator', behaviours: { minNodes: 0 } })?.shown,
    ).toBe(false);
    expect(minNotice({ type: 'NameGenerator' })?.shown).toBe(false);
  });

  it('shows an optional setting only while the stage holds it', () => {
    const hint = (nameField: unknown) =>
      stageWordingShown(
        { type: 'FamilyPedigree', nodeConfiguration: { nameField } },
        locales,
      ).find(
        ({ path }) => path.join('.') === 'nodeConfiguration.nameField.hint',
      );

    expect(hint({ prompt: { en: 'Name?' } })?.shown).toBe(false);
    expect(hint({ prompt: { en: 'Name?' }, hint: { en: 'Hint' } })?.shown).toBe(
      true,
    );
    expect(
      hint({ prompt: { en: 'Name?' }, hint: { en: 'Hint' } })?.value.en,
    ).toBe('Hint');
    // The prompt is not optional: the interview shows it, wording its own.
    expect(
      stageWordingShown(
        { type: 'FamilyPedigree', nodeConfiguration: {} },
        locales,
      ).find(
        ({ path }) => path.join('.') === 'nodeConfiguration.nameField.prompt',
      )?.shown,
    ).toBe(true);
  });

  it('shows a setting within an optional object only while the stage has the object', () => {
    const completenessTexts = (stage: Record<string, unknown>) =>
      stageWordingShown({ type: 'FamilyPedigree', ...stage }, locales).filter(
        ({ path }) => path[0] === 'completeness',
      );

    expect(completenessTexts({}).length).toBeGreaterThan(0);
    expect(completenessTexts({}).some(({ shown }) => shown)).toBe(false);
    expect(
      completenessTexts({ completeness: { scope: 'parents' } }).every(
        ({ shown }) => shown,
      ),
    ).toBe(true);
  });
});

describe('a stage that omits the wording Network Canvas supplies', () => {
  const stageTypes = [
    'CategoricalBin',
    'FamilyPedigree',
    'FinishSession',
    'Geospatial',
    'LanguageChooser',
    'NameGenerator',
    'NameGeneratorQuickAdd',
    'NameGeneratorRoster',
    'Narrative',
    'NarrativePedigree',
    'OrdinalBin',
  ];

  /**
   * `document` without the value at `path`, and without any object that
   * leaves empty, so a stage omits an object that held only wording too.
   */
  const without = (document: unknown, path: readonly (string | number)[]) => {
    const copy = structuredClone(document);
    const holders: unknown[] = [copy];
    for (const key of path.slice(0, -1)) {
      const holder = holders.at(-1);
      holders.push(
        typeof holder === 'object' && holder !== null
          ? Reflect.get(holder, key)
          : undefined,
      );
    }
    for (let depth = path.length - 1; depth >= 2; depth -= 1) {
      const holder = holders[depth];
      const key = path[depth];
      if (typeof holder !== 'object' || holder === null || key === undefined)
        break;
      Reflect.deleteProperty(holder, key);
      if (Object.keys(holder).length > 0) break;
    }
    return copy;
  };

  const stages = completeProtocol().stages;
  const heldAt = (document: unknown, path: readonly string[]) =>
    path.reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null
          ? Reflect.get(current, key)
          : undefined,
      document,
    );
  const CONDITIONAL_AND_ABSENT = [
    'NameGeneratorQuickAdd minNodesNotice',
    'NameGeneratorQuickAdd maxNodesNotice',
    'CategoricalBin unplacedNodesNotice',
  ];

  it('is accepted, whichever setting it omits, for every kind of stage', () => {
    expect(ProtocolSchemaV9.safeParse(completeProtocol()).success).toBe(true);

    let checked = 0;
    for (const type of stageTypes) {
      const paths = suppliedStageSettingPaths(type);
      expect(paths.length).toBeGreaterThan(0);
      const indexes = stages.flatMap((stage, index) =>
        stage.type === type ? [index] : [],
      );
      expect(indexes.length).toBeGreaterThan(0);

      for (const index of indexes) {
        for (const path of paths) {
          const key = `${type} ${path.join('.')}`;
          // A setting only some configurations show is absent from a
          // fixture that is not configured so; omitting it is a no-op.
          expect(
            heldAt(stages[index], path) !== undefined ||
              CONDITIONAL_AND_ABSENT.includes(key),
            `the fixture's ${key}`,
          ).toBe(true);
          const result = ProtocolSchemaV9.safeParse(
            without(completeProtocol(), ['stages', index, ...path]),
          );
          expect(
            result.success,
            `${type} without ${path.join('.')}: ${JSON.stringify(result.error?.issues)}`,
          ).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('is accepted when it omits all of it at once', () => {
    let protocol: unknown = completeProtocol();
    stages.forEach((stage, index) => {
      for (const path of suppliedStageSettingPaths(stage.type)) {
        protocol = without(protocol, ['stages', index, ...path]);
      }
    });
    const result = ProtocolSchemaV9.safeParse(protocol);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('is accepted by a protocol with no interface text at all', () => {
    const { interfaceText: _held, ...protocol } = completeProtocol();
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });
});
