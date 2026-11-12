import { describe, expect, it } from 'vitest';

import {
  familyPedigreeWordingIn,
  stageWithSuppliedText,
  stageWithoutSuppliedText,
  stageWordingShown,
  suppliedStageText,
  withoutSuppliedWording,
} from '../../../__tests__/suppliedWording.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import {
  suppliedStageSettingApplies,
  suppliedStageSettingPaths,
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
  });

  it('is supplied for no other stage', () => {
    expect(
      suppliedStageText('NameGenerator', english).filter(panelTitleOnly),
    ).toEqual([]);
  });
});

describe('migrating a roster stage to schema 9', () => {
  const rosterOf = (protocol: { stages: readonly unknown[] }) =>
    protocol.stages.find(
      (stage) => (stage as { type?: unknown }).type === 'NameGeneratorRoster',
    ) as Record<string, unknown> | undefined;

  // Schema 8 had no heading to hold. None is written in: the interview shows
  // Network Canvas's for a roster that does not hold one.
  it('writes no heading into a schema 8 roster', () => {
    const document = asSchema8Protocol(completeProtocol());
    delete rosterOf(document)!.panelTitle;
    const migrated = migrateProtocol(document, 9);
    expect(rosterOf(migrated)).not.toHaveProperty('panelTitle');
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  // Fresco's deploy normalization re-runs this migration over rows already
  // stored at schema 9.
  // The migration has no catalogue to hand, so it cannot tell a copy of
  // Network Canvas's wording from a rewording: it writes none, and keeps what
  // the stage holds. The tool that next stores the protocol removes a copy.
  it('writes no heading on a roster already in schema 9 form, and keeps the one it holds', () => {
    const document = {
      ...completeProtocol(),
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'de'] },
    };
    const untitled = structuredClone(document);
    delete rosterOf(untitled)!.panelTitle;
    expect(rosterOf(migrateProtocol(untitled, 9))).not.toHaveProperty(
      'panelTitle',
    );

    const titled = structuredClone(document);
    Object.assign(rosterOf(titled)!, { panelTitle: { en: 'Services' } });
    expect(rosterOf(migrateProtocol(titled, 9))?.panelTitle).toEqual({
      en: 'Services',
    });

    const partly = structuredClone(document);
    Object.assign(rosterOf(partly)!, {
      panelTitle: { en: 'Available to add', de: 'Dienste' },
    });
    const migrated = migrateProtocol(partly, 9);
    expect(rosterOf(migrated)?.panelTitle).toEqual({
      en: 'Available to add',
      de: 'Dienste',
    });
    expect(rosterOf(withoutSuppliedWording(migrated))?.panelTitle).toEqual({
      de: 'Dienste',
    });
  });
});

describe('a stage as an editor holds it', () => {
  const locales = { defaultLocale: 'en', locales: ['en', 'es', 'hu'] };

  it('holds Network Canvas’s wording for a setting the stage does not hold, in each language it has it in', () => {
    expect(stageWithSuppliedText({ type: 'LanguageChooser' }, locales)).toEqual(
      {
        type: 'LanguageChooser',
        title: { en: 'Choose a language', es: 'Elige un idioma' },
      },
    );
  });

  it('keeps each translation the stage holds and fills in the others', () => {
    expect(
      stageWithSuppliedText(
        { type: 'LanguageChooser', title: { es: 'Idioma', hu: 'Nyelv' } },
        locales,
      ).title,
    ).toEqual({ en: 'Choose a language', es: 'Idioma', hu: 'Nyelv' });
  });

  it('is the same stage when it already holds all of it', () => {
    const chooser = {
      type: 'LanguageChooser',
      title: { en: 'Pick one', es: 'Elige uno' },
    };
    expect(stageWithSuppliedText(chooser, locales)).toBe(chooser);
  });

  it('holds an empty text for a setting no protocol language has wording for', () => {
    expect(
      stageWithSuppliedText(
        { type: 'LanguageChooser' },
        { defaultLocale: 'hu', locales: ['hu'] },
      ).title,
    ).toEqual({});
  });

  it('fills in only the settings the stage shows', () => {
    const generator = stageWithSuppliedText(
      { type: 'NameGenerator', behaviours: { minNodes: 2 } },
      english,
    );
    expect(generator).toHaveProperty('minNodesNotice.en');
    expect(generator).not.toHaveProperty('maxNodesNotice');
  });

  it('leaves something that is not text for the schema to refuse', () => {
    const chooser = { type: 'LanguageChooser', title: 'Pick one' };
    expect(stageWithSuppliedText(chooser, locales)).toBe(chooser);
  });
});

describe('a stage as a protocol stores it', () => {
  it('holds none of the wording that reads as Network Canvas words it', () => {
    expect(
      stageWithoutSuppliedText({
        type: 'LanguageChooser',
        title: { en: 'Choose a language', es: 'Elige un idioma' },
      }),
    ).toEqual({ type: 'LanguageChooser' });
  });

  it('keeps the translations that are the researcher’s own', () => {
    expect(
      stageWithoutSuppliedText({
        type: 'LanguageChooser',
        title: { en: 'Pick one', es: 'Elige un idioma', hu: 'Nyelv' },
      }).title,
    ).toEqual({ en: 'Pick one', hu: 'Nyelv' });
  });

  it('is the same stage when there is nothing to remove', () => {
    const reworded = { type: 'LanguageChooser', title: { en: 'Pick one' } };
    expect(stageWithoutSuppliedText(reworded)).toBe(reworded);
    const bare = { type: 'LanguageChooser' };
    expect(stageWithoutSuppliedText(bare)).toBe(bare);
  });

  it('removes a setting left holding no text at all', () => {
    expect(
      stageWithoutSuppliedText({ type: 'LanguageChooser', title: {} }),
    ).toEqual({ type: 'LanguageChooser' });
  });

  const notices = {
    minNodesNotice: { en: 'Add {count, plural, one {# more} other {# more}}' },
    maxNodesNotice: { en: 'That is everyone' },
  };

  it('removes a setting the stage no longer shows, whatever it says', () => {
    expect(
      stageWithoutSuppliedText({
        type: 'NameGenerator',
        behaviours: {},
        ...notices,
      }),
    ).toEqual({ type: 'NameGenerator', behaviours: {} });
  });

  it('keeps the researcher’s wording for a setting whose configuration is on', () => {
    const generator = {
      type: 'NameGenerator',
      behaviours: { minNodes: 1, maxNodes: 3 },
      ...notices,
    };
    expect(stageWithoutSuppliedText(generator)).toBe(generator);
  });

  it('removes an object left holding nothing', () => {
    const conditionText = Object.fromEntries(
      suppliedStageText('NarrativePedigree', english)
        .filter(({ path }) => path[0] === 'conditionText')
        .map(({ path, value }) => [path[1], value]),
    );
    expect(Object.keys(conditionText).length).toBeGreaterThan(0);
    expect(
      stageWithoutSuppliedText({
        type: 'NarrativePedigree',
        sourceStageId: 'pedigree',
        conditionText,
      }),
    ).toEqual({ type: 'NarrativePedigree', sourceStageId: 'pedigree' });
  });

  // Removing the tracker's last reworded text must not remove the tracker.
  it('never removes the object a setting belongs to', () => {
    expect(
      stageWithoutSuppliedText({
        type: 'FamilyPedigree',
        completeness: {
          recommendedNote: {
            en: 'You can also continue without these by pressing Next again.',
          },
        },
      }),
    ).toEqual({ type: 'FamilyPedigree', completeness: {} });
  });

  it('leaves something that is not text for the schema to refuse', () => {
    const chooser = { type: 'LanguageChooser', title: 'Pick one' };
    expect(stageWithoutSuppliedText(chooser)).toBe(chooser);
    const mixed = { type: 'LanguageChooser', title: { en: 3 } };
    expect(stageWithoutSuppliedText(mixed)).toBe(mixed);
  });

  it('undoes what an editor filled in, for every stage of a protocol', () => {
    const localization = { defaultLocale: 'en', locales: ['en', 'es', 'hu'] };
    for (const stage of completeProtocol().stages) {
      const stored = stageWithoutSuppliedText(stage);
      const edited = stageWithSuppliedText(stored, localization);
      expect(stageWithoutSuppliedText(edited), stage.type).toEqual(stored);
      // And an editor's stage is filled in once: filling it again adds nothing.
      expect(stageWithSuppliedText(edited, localization), stage.type).toBe(
        edited,
      );
    }
  });
});

describe('the Family Pedigree wording Network Canvas supplies', () => {
  const localization = { defaultLocale: 'en', locales: ['en', 'de'] };
  const filled = (stage: Record<string, unknown>) =>
    stageWithSuppliedText({ type: 'FamilyPedigree', ...stage }, localization);

  // The wording a stage shows only while its configuration is on: the framing
  // question while participants choose the words, the gender identity
  // question while the stage asks about gender identity.
  const CONFIGURED = [
    'framingChoiceTitle',
    'framingChoiceDescription',
    'framingControlLabel',
    'genderIdentityLabel',
  ];
  const alwaysWording = Object.keys(familyPedigreeWordingIn()).filter(
    (key) => !CONFIGURED.includes(key),
  );

  it('gives an editor a new stage’s name question, its hint and its wording, and no tracker wording until it has a tracker', () => {
    const stage = filled({});
    expect(stage).toHaveProperty('nodeConfiguration.nameField.prompt.de');
    expect(stage).toHaveProperty('nodeConfiguration.nameField.hint.de');
    expect(Object.keys(stage.wording as object)).toEqual(alwaysWording);
    expect(stage).not.toHaveProperty('completeness');
  });

  it('gives an editor all of a tracker’s wording once the stage has a tracker', () => {
    const { completeness } = filled({ completeness: { scope: 'parents' } });
    expect(completeness).toMatchObject({ scope: 'parents' });
    for (const path of [
      'itemText.parents.listItem',
      'itemText.siblings.listItem',
      'itemText.siblings.noneButton',
      'itemText.siblings.question',
      'itemText.children.listItem',
      'itemText.children.noneButton',
      'itemText.children.question',
      'itemText.details.listItem',
      'recommendedNote',
    ]) {
      expect(completeness).toHaveProperty(`${path}.en`);
    }
  });

  // The hint is a text the interview always shows, so a stage holding a
  // prompt of its own and no hint reads with Network Canvas's hint.
  it('gives an editor Network Canvas’s hint for a stage that holds only a prompt', () => {
    const stage = filled({
      nodeConfiguration: { nameField: { prompt: { en: 'Name' } } },
    });
    expect(stage).toHaveProperty('nodeConfiguration.nameField.prompt', {
      en: 'Name',
      de: expect.any(String) as unknown as string,
    });
    expect(stage).toHaveProperty('nodeConfiguration.nameField.hint.en');
  });

  it('is worded with its arguments, in each language it is supplied in', () => {
    const parents = suppliedStageText('FamilyPedigree', {
      defaultLocale: 'en',
      locales: ['en', 'zh-Hans'],
    }).find(
      ({ path }) => path.join('.') === 'completeness.itemText.parents.listItem',
    );
    expect(parents?.value['zh-Hans']).toContain('{isYou, select,');
    expect(parents?.value.en).toContain('{name}');
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

  it('always shows the name hint, Network Canvas’s where the stage holds none', () => {
    const hint = (nameField: unknown) =>
      stageWordingShown(
        { type: 'FamilyPedigree', nodeConfiguration: { nameField } },
        locales,
      ).find(
        ({ path }) => path.join('.') === 'nodeConfiguration.nameField.hint',
      );

    expect(hint({ prompt: { en: 'Name?' } })?.shown).toBe(true);
    expect(hint({ prompt: { en: 'Name?' } })?.value.en).toEqual(
      expect.any(String),
    );
    expect(
      hint({ prompt: { en: 'Name?' }, hint: { en: 'Hint' } })?.value.en,
    ).toBe('Hint');
    expect(hint(undefined)?.shown).toBe(true);
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

  it('starts from a protocol that is valid with all of it held', () => {
    expect(ProtocolSchemaV9.safeParse(completeProtocol()).success).toBe(true);
  });

  // The whole protocol is validated once for each setting, which for the
  // Family Pedigree is some eighty times: seconds on a loaded machine, so the
  // time allowed is set for that rather than for one validation.
  it.each(stageTypes)(
    'is accepted, whichever setting it omits, on a %s stage',
    { timeout: 60_000 },
    (type) => {
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
        }
      }
    },
  );

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
