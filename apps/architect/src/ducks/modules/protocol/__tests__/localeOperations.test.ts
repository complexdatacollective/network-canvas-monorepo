import { describe, expect, it } from 'vitest';

import {
  collectLocalizedStrings,
  createDefaultFinishSessionStage,
  type CurrentProtocol,
  DEFAULT_FINISH_SESSION_TEXT,
  escapeMessageText,
  type LocalizedStringHit,
  messageText,
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  suppliedOptionLabel,
  suppliedOptionLabels,
  validateProtocol,
} from '@codaco/protocol-validation';

import {
  addLocales,
  changeLocale,
  getLocaleRemovalImpact,
  type LocaleOperationResult,
  removeLocale,
  rewriteLocalizedStrings,
  setDefaultLocale,
  movedLocale,
  setTranslation,
  withoutLocale,
} from '../localeOperations';

const NODE_TYPE = 'person';
const VARIABLE = 'closeness';

const protocolIn = (
  localization: CurrentProtocol['localization'],
  text: {
    stage: Record<string, string>;
    title: Record<string, string>;
    nodeType: Record<string, string>;
    variable: string;
    options: [Record<string, string>, Record<string, string>];
  },
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization,
  assetManifest: {},
  codebook: {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        label: text.nodeType,
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [VARIABLE]: {
            name: 'closeness',
            label: text.variable,
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: text.options[0], value: 'close' },
              { label: text.options[1], value: 'distant' },
            ],
          },
        },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: text.stage,
      title: text.title,
      items: [],
    },
    {
      id: 'finish',
      type: 'FinishSession',
      label: text.stage,
      title: text.title,
      content: text.title,
      outcome: 'completed',
    },
  ],
});

const monolingual = () =>
  protocolIn(
    { defaultLocale: 'en', locales: ['en'] },
    {
      stage: { en: 'Welcome' },
      title: { en: 'Hello' },
      nodeType: { en: 'Person' },
      variable: 'Closeness',
      options: [{ en: 'Close' }, { en: 'Distant' }],
    },
  );

const bilingual = () =>
  protocolIn(
    { defaultLocale: 'en', locales: ['en', 'fr'] },
    {
      stage: { en: 'Welcome', fr: 'Bienvenue' },
      title: { en: 'Hello', fr: 'Bonjour' },
      nodeType: { en: 'Person', fr: 'Personne' },
      variable: 'Closeness',
      options: [{ en: 'Close', fr: 'Proche' }, { en: 'Distant' }],
    },
  );

const protocolOf = (result: LocaleOperationResult) => {
  if (!result.ok) throw new Error(`Refused: ${result.reason}`);
  return result.protocol;
};

const textOf = (protocol: CurrentProtocol) => {
  const stage = protocol.stages[0];
  const nodeType = protocol.codebook.node?.[NODE_TYPE];
  const variable = nodeType?.variables?.[VARIABLE];
  return {
    stage: stage?.label,
    title: stage && 'title' in stage ? stage.title : undefined,
    nodeType: nodeType?.label,
    variable: variable?.label,
    options:
      variable && 'options' in variable
        ? variable.options?.map(({ label }) => label)
        : undefined,
  };
};

const withSuppliedFinish = (): CurrentProtocol => {
  const protocol = monolingual();
  return {
    ...protocol,
    stages: [
      ...protocol.stages.slice(0, -1),
      createDefaultFinishSessionStage({
        id: 'finish',
        localization: protocol.localization,
      }),
    ],
  };
};

// A protocol whose Family Pedigree records sex assigned at birth and the
// kind of each relationship in attributes labelled with the supplied
// labels, as Architect creates them. Partial: the locale operations read
// only the stage's attribute bindings and the codebook.
const withPedigree = (
  sexLabels: (value: string) => Record<string, string> = (value) =>
    suppliedOptionLabels('pedigreeSexAssignedAtBirth', value, {
      defaultLocale: 'en',
      locales: ['en'],
    }),
): CurrentProtocol =>
  ({
    ...monolingual(),
    codebook: {
      node: {
        relative: {
          name: 'relative',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            sex: {
              name: 'sex',
              type: 'categorical',
              options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
                value,
                label: sexLabels(value),
              })),
            },
          },
        },
      },
      edge: {
        family: {
          name: 'family',
          color: 'edge-color-seq-1',
          variables: {
            relType: {
              name: 'relType',
              type: 'categorical',
              options: PEDIGREE_RELATIONSHIP_KINDS.map((value) => ({
                value,
                label: suppliedOptionLabels('pedigreeRelationship', value, {
                  defaultLocale: 'en',
                  locales: ['en'],
                }),
              })),
            },
          },
        },
      },
    },
    stages: [
      {
        id: 'familyPedigree',
        type: 'FamilyPedigree',
        label: { en: 'Family' },
        subject: { entity: 'node', type: 'relative' },
        nodeConfiguration: { sexAssignedAtBirthAttribute: 'sex' },
        edgeConfiguration: { type: 'family', kindAttribute: 'relType' },
      },
    ],
  }) as unknown as CurrentProtocol;

const labelsOf = (
  protocol: CurrentProtocol,
  entity: 'node' | 'edge',
  type: string,
  variable: string,
) => {
  const definition = protocol.codebook[entity]?.[type]?.variables?.[variable];
  return definition?.type === 'categorical'
    ? definition.options.map((option) => option.label)
    : undefined;
};

describe('addLocales', () => {
  it('declares languages after the existing ones, by their canonical tags', () => {
    const protocol = protocolOf(addLocales(bilingual(), ['PT-br', 'zh-hant']));

    expect(protocol.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'fr', 'pt-BR', 'zh-Hant'],
    });
    expect(textOf(protocol)).toEqual(textOf(bilingual()));
  });

  describe('a finish stage with the supplied closing text', () => {
    it('gets that text in each new language it is supplied in, and nothing else is translated', async () => {
      const protocol = protocolOf(
        addLocales(withSuppliedFinish(), ['pt-BR', 'ja']),
      );
      const finish = protocol.stages.at(-1);
      expect(finish).toMatchObject({
        label: {
          'en': DEFAULT_FINISH_SESSION_TEXT.en.label,
          'pt-BR': DEFAULT_FINISH_SESSION_TEXT['pt-BR'].label,
        },
        title: {
          'en': DEFAULT_FINISH_SESSION_TEXT.en.title,
          'pt-BR': DEFAULT_FINISH_SESSION_TEXT['pt-BR'].title,
        },
        content: {
          'en': DEFAULT_FINISH_SESSION_TEXT.en.content,
          'pt-BR': DEFAULT_FINISH_SESSION_TEXT['pt-BR'].content,
        },
      });
      expect(Object.keys(finish?.label ?? {})).not.toContain('ja');
      expect(protocol.stages[0]).toEqual(withSuppliedFinish().stages[0]);
      expect((await validateProtocol(protocol)).success).toBe(true);
    });

    it('stays untranslated once the researcher has rewritten it', () => {
      const edited = withSuppliedFinish();
      const finish = edited.stages.at(-1);
      if (finish?.type !== 'FinishSession') throw new Error('No finish stage');
      edited.stages = [
        ...edited.stages.slice(0, -1),
        { ...finish, content: { en: 'Thanks for taking part.' } },
      ];
      const protocol = protocolOf(addLocales(edited, ['fr']));
      expect(protocol.stages).toEqual(edited.stages);
    });
  });

  describe('the answers a Family Pedigree asks for', () => {
    it('get their supplied labels in each new language that has them', () => {
      const protocol = protocolOf(addLocales(withPedigree(), ['es', 'ja']));
      expect(labelsOf(protocol, 'node', 'relative', 'sex')).toEqual(
        PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
          en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
          es: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'es'),
        })),
      );
      expect(labelsOf(protocol, 'edge', 'family', 'relType')).toEqual(
        PEDIGREE_RELATIONSHIP_KINDS.map((value) => ({
          en: suppliedOptionLabel('pedigreeRelationship', value, 'en'),
          es: suppliedOptionLabel('pedigreeRelationship', value, 'es'),
        })),
      );
    });

    it('stay untranslated once the researcher has reworded one', () => {
      const reworded = withPedigree((value) =>
        value === 'intersex'
          ? { en: 'Intersex or variation of sex' }
          : suppliedOptionLabels('pedigreeSexAssignedAtBirth', value, {
              defaultLocale: 'en',
              locales: ['en'],
            }),
      );
      const protocol = protocolOf(addLocales(reworded, ['es']));
      expect(labelsOf(protocol, 'node', 'relative', 'sex')).toEqual(
        labelsOf(reworded, 'node', 'relative', 'sex'),
      );
    });
  });

  it('refuses a tag that is not a language, and adds none of the batch', () => {
    expect(addLocales(bilingual(), ['de', 'not a tag'])).toEqual({
      ok: false,
      reason: 'invalid-tag',
    });
  });

  it.each(['und', 'UND', 'und-Latn'])(
    'never introduces the undetermined language %s',
    (tag) => {
      expect(addLocales(bilingual(), [tag])).toEqual({
        ok: false,
        reason: 'invalid-tag',
      });
    },
  );

  it('refuses a language that is declared already, however it is written', () => {
    expect(addLocales(bilingual(), ['FR'])).toEqual({
      ok: false,
      reason: 'already-declared',
    });
    expect(addLocales(bilingual(), ['de', 'DE'])).toEqual({
      ok: false,
      reason: 'already-declared',
    });
  });
});

describe('removeLocale', () => {
  it('counts the translations a removal deletes', () => {
    expect(
      getLocaleRemovalImpact(collectLocalizedStrings(bilingual()), 'fr')
        .translationCount,
    ).toBe(7);
  });

  it('counts each text once however many readings of it there are', () => {
    // The stage's title as the protocol holds it, and as an open editor holds
    // it unsaved, with the English deleted.
    const unsaved: LocalizedStringHit = {
      path: ['stages', 0, 'title'],
      value: { fr: 'Bonjour' },
      format: 'plain',
    };
    const impact = getLocaleRemovalImpact(
      [...collectLocalizedStrings(bilingual()), unsaved],
      'fr',
    );

    expect(impact.translationCount).toBe(7);
    expect(impact.strandedStrings).toEqual([unsaved]);
  });

  it('deletes the language and every translation written in it', async () => {
    const protocol = protocolOf(removeLocale(bilingual(), 'fr'));

    expect(protocol.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en'],
    });
    expect(textOf(protocol)).toEqual({
      stage: { en: 'Welcome' },
      title: { en: 'Hello' },
      nodeType: { en: 'Person' },
      variable: 'Closeness',
      options: [{ en: 'Close' }, { en: 'Distant' }],
    });
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('refuses to remove the default language', () => {
    expect(removeLocale(bilingual(), 'en')).toEqual({
      ok: false,
      reason: 'default-locale',
    });
  });

  it('refuses to remove a language that some text exists only in', () => {
    // The "Distant" option is written only in English.
    const frenchDefault = protocolOf(setDefaultLocale(bilingual(), 'fr'));

    expect(
      getLocaleRemovalImpact(
        collectLocalizedStrings(frenchDefault),
        'en',
      ).strandedStrings.map(({ value }) => value),
    ).toEqual([{ en: 'Distant' }]);
    expect(removeLocale(frenchDefault, 'en')).toEqual({
      ok: false,
      reason: 'would-empty',
    });
  });

  it('refuses a language the protocol does not declare', () => {
    expect(removeLocale(bilingual(), 'de')).toEqual({
      ok: false,
      reason: 'not-declared',
    });
  });
});

describe('rewriteLocalizedStrings', () => {
  const stageFields = () => ({
    stages: [
      {
        type: 'Information',
        label: { en: 'Welcome', fr: 'Bienvenue' },
        title: { en: 'Hello', fr: 'Bonjour' },
        interviewScript: 'fr',
        items: [],
      },
    ],
  });

  it('rewrites the texts of part of a protocol, and nothing else', () => {
    expect(rewriteLocalizedStrings(stageFields(), withoutLocale('fr'))).toEqual(
      {
        stages: [
          {
            type: 'Information',
            label: { en: 'Welcome' },
            title: { en: 'Hello' },
            interviewScript: 'fr',
            items: [],
          },
        ],
      },
    );
  });

  it('moves translations written in one language to another, keeping their order', () => {
    const [stage] = rewriteLocalizedStrings(
      {
        stages: [
          {
            type: 'Information',
            label: { en: 'Welcome', fr: 'Bienvenue' },
            title: { fr: 'Bonjour' },
            items: [],
          },
        ],
      },
      movedLocale('en', 'es'),
    ).stages;

    expect(Object.entries(stage?.label ?? {})).toEqual([
      ['es', 'Welcome'],
      ['fr', 'Bienvenue'],
    ]);
    expect(stage?.title).toEqual({ fr: 'Bonjour' });
  });

  it('answers with the same document when nothing changes', () => {
    const fields = stageFields();
    expect(rewriteLocalizedStrings(fields, withoutLocale('de'))).toBe(fields);
  });
});

describe('setDefaultLocale', () => {
  it('makes a declared language the default without reordering the others', () => {
    expect(
      protocolOf(setDefaultLocale(bilingual(), 'fr')).localization,
    ).toEqual({ defaultLocale: 'fr', locales: ['en', 'fr'] });
  });

  it('refuses a language the protocol does not declare', () => {
    expect(setDefaultLocale(bilingual(), 'de')).toEqual({
      ok: false,
      reason: 'not-declared',
    });
  });
});

describe('changeLocale', () => {
  it('records a language\u2019s text as another language in a single step', async () => {
    const protocol = protocolOf(changeLocale(monolingual(), 'en', 'es'));

    expect(protocol.localization).toEqual({
      defaultLocale: 'es',
      locales: ['es'],
    });
    expect(textOf(protocol)).toEqual({
      stage: { es: 'Welcome' },
      title: { es: 'Hello' },
      nodeType: { es: 'Person' },
      variable: 'Closeness',
      options: [{ es: 'Close' }, { es: 'Distant' }],
    });
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('canonicalizes the tag it is given', () => {
    expect(
      protocolOf(changeLocale(monolingual(), 'en', ' PT-br ')).localization,
    ).toEqual({ defaultLocale: 'pt-BR', locales: ['pt-BR'] });
  });

  it('moves one language of several without touching the others or the default', () => {
    const protocol = protocolOf(changeLocale(bilingual(), 'fr', 'de'));

    expect(protocol.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'de'],
    });
    expect(textOf(protocol).stage).toEqual({ en: 'Welcome', de: 'Bienvenue' });
    expect(textOf(protocol).options).toEqual([
      { en: 'Close', de: 'Proche' },
      { en: 'Distant' },
    ]);
  });

  it('moves the default with the language it names', () => {
    const protocol = protocolOf(changeLocale(bilingual(), 'en', 'es'));

    expect(protocol.localization).toEqual({
      defaultLocale: 'es',
      locales: ['es', 'fr'],
    });
  });

  it('refuses a language the protocol does not declare', () => {
    expect(changeLocale(bilingual(), 'de', 'es')).toEqual({
      ok: false,
      reason: 'not-declared',
    });
  });

  it('never merges a language into one the protocol already has', () => {
    expect(changeLocale(bilingual(), 'en', 'fr')).toEqual({
      ok: false,
      reason: 'already-declared',
    });
    expect(changeLocale(bilingual(), 'en', 'FR')).toEqual({
      ok: false,
      reason: 'already-declared',
    });
  });

  it('refuses to change a language to itself', () => {
    expect(changeLocale(bilingual(), 'en', 'en')).toEqual({
      ok: false,
      reason: 'already-declared',
    });
  });

  it.each(['und', 'und-Latn', 'not a tag', ''])(
    'refuses %j, which names no language',
    (tag) => {
      expect(changeLocale(monolingual(), 'en', tag)).toEqual({
        ok: false,
        reason: 'invalid-tag',
      });
    },
  );
});

describe('setTranslation', () => {
  const distantLabel = [
    'codebook',
    'node',
    NODE_TYPE,
    'variables',
    VARIABLE,
    'options',
    1,
    'label',
  ];

  it('writes one translation and keeps every other one', async () => {
    const protocol = protocolOf(
      setTranslation(bilingual(), distantLabel, 'fr', 'Lointain'),
    );

    expect(textOf(protocol)).toEqual({
      ...textOf(bilingual()),
      options: [
        { en: 'Close', fr: 'Proche' },
        { en: 'Distant', fr: 'Lointain' },
      ],
    });
    expect(protocol.localization).toEqual(bilingual().localization);
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('stores the text escaped as message syntax, as the stage editors do', () => {
    const text = "Don't {skip} this";
    const protocol = protocolOf(
      setTranslation(bilingual(), ['stages', 0, 'title'], 'fr', text),
    );
    const stored = textOf(protocol).title?.fr;

    expect(stored).toBe(escapeMessageText(text));
    expect(messageText(stored ?? '')).toBe(text);
  });

  it('refuses a path where the protocol holds no participant-facing text', () => {
    for (const path of [
      ['stages', 0, 'nonexistent'],
      ['stages', 0],
      ['stages', '0', 'title'],
      ['stages', 0, 'title', 'en'],
      [],
    ]) {
      expect(setTranslation(bilingual(), path, 'fr', 'Bonjour')).toEqual({
        ok: false,
        reason: 'not-localized-string',
      });
    }
  });

  it('refuses a language the protocol does not declare', () => {
    expect(setTranslation(bilingual(), distantLabel, 'de', 'Fern')).toEqual({
      ok: false,
      reason: 'not-declared',
    });
  });

  it('refuses blank text', () => {
    for (const text of ['', '   ', '\n\t']) {
      expect(setTranslation(bilingual(), distantLabel, 'fr', text)).toEqual({
        ok: false,
        reason: 'blank-text',
      });
    }
  });
});

describe('text Network Canvas supplies, when a language is corrected or the default changes', () => {
  it('becomes the supplied text of the corrected language, as when an English protocol migrated from schema 8 is really German', async () => {
    const protocol = protocolOf(changeLocale(withSuppliedFinish(), 'en', 'de'));
    expect(protocol.stages.at(-1)).toMatchObject({
      label: { de: DEFAULT_FINISH_SESSION_TEXT.de.label },
      title: { de: DEFAULT_FINISH_SESSION_TEXT.de.title },
      content: { de: DEFAULT_FINISH_SESSION_TEXT.de.content },
    });
    const pedigree = protocolOf(changeLocale(withPedigree(), 'en', 'de'));
    expect(labelsOf(pedigree, 'node', 'relative', 'sex')).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        de: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'de'),
      })),
    );
    expect(labelsOf(pedigree, 'edge', 'family', 'relType')).toEqual(
      PEDIGREE_RELATIONSHIP_KINDS.map((value) => ({
        de: suppliedOptionLabel('pedigreeRelationship', value, 'de'),
      })),
    );
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('moves unchanged with its language once the researcher has rewritten it', () => {
    const reworded = withPedigree((value) =>
      value === 'intersex'
        ? { en: 'Intersex or variation of sex' }
        : suppliedOptionLabels('pedigreeSexAssignedAtBirth', value, {
            defaultLocale: 'en',
            locales: ['en'],
          }),
    );
    const protocol = protocolOf(changeLocale(reworded, 'en', 'de'));
    expect(labelsOf(protocol, 'node', 'relative', 'sex')).toEqual(
      labelsOf(reworded, 'node', 'relative', 'sex')?.map((label) => ({
        de: (label as Record<string, string>).en,
      })),
    );
  });

  it('gives a new default language with no supplied labels the English ones, so a language added later is still filled in', () => {
    const withHungarian = protocolOf(addLocales(withPedigree(), ['hu']));
    const huDefault = protocolOf(setDefaultLocale(withHungarian, 'hu'));
    expect(labelsOf(huDefault, 'node', 'relative', 'sex')).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
        hu: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
      })),
    );
    const withGerman = protocolOf(addLocales(huDefault, ['de']));
    expect(labelsOf(withGerman, 'node', 'relative', 'sex')).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
        hu: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
        de: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'de'),
      })),
    );
  });
});

describe('a roster stage’s supplied panel title', () => {
  const withRoster = (panelTitle: Record<string, string>): CurrentProtocol =>
    ({
      ...monolingual(),
      stages: [
        {
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: { en: 'Services' },
          subject: { entity: 'node', type: 'person' },
          dataSource: 'roster',
          panelTitle,
          prompts: [{ id: 'p1', text: { en: 'Which services?' } }],
        },
      ],
    }) as unknown as CurrentProtocol;
  const panelTitleOf = (protocol: CurrentProtocol) =>
    (protocol.stages[0] as { panelTitle?: unknown }).panelTitle;

  it('is filled into a new language, and follows a corrected one, while it is unchanged', () => {
    expect(
      panelTitleOf(
        protocolOf(addLocales(withRoster({ en: 'Available to add' }), ['fr'])),
      ),
    ).toEqual({ en: 'Available to add', fr: 'Éléments disponibles' });
    expect(
      panelTitleOf(
        protocolOf(
          changeLocale(withRoster({ en: 'Available to add' }), 'en', 'de'),
        ),
      ),
    ).toEqual({ de: 'Zum Hinzufügen verfügbar' });
  });

  it('is left to the researcher once they have changed it', () => {
    expect(
      panelTitleOf(
        protocolOf(addLocales(withRoster({ en: 'Services' }), ['fr'])),
      ),
    ).toEqual({ en: 'Services' });
  });
});
