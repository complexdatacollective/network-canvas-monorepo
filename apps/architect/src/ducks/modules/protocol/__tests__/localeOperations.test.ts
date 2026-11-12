import { describe, expect, it } from 'vitest';

import {
  withInterfaceText,
  withoutSuppliedWording,
  withSuppliedWording,
  familyPedigreeWordingIn,
} from '@codaco/interview/supplied-wording';
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
  setFallbackLocale,
  movedLocale,
  setTranslation,
  withoutLocale,
} from '../localeOperations';

const NODE_TYPE = 'person';
const VARIABLE = 'closeness';

// Every declared locale gets the same text, so no settings string exists
// in one language only.
const everyLocale = (
  localization: CurrentProtocol['localization'],
  text: string,
): Record<string, string> =>
  Object.fromEntries(localization.locales.map((locale) => [locale, text]));

const protocolIn = (
  localization: CurrentProtocol['localization'],
  text: {
    stage: Record<string, string>;
    title: Record<string, string>;
    options: [Record<string, string>, Record<string, string>];
  },
): CurrentProtocol =>
  // Holding the interface text it should: only the researcher's own, as the
  // active protocol always does.
  withInterfaceText({
    name: 'Study',
    schemaVersion: 9,
    localization,
    assetManifest: {},
    codebook: {
      node: {
        [NODE_TYPE]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [VARIABLE]: {
              name: 'closeness',
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
        mode: 'confirmation',
        label: text.stage,
        content: text.title,
        finishedContent: text.title,
        finishLabel: everyLocale(localization, 'Finish'),
        finishConfirmation: everyLocale(localization, 'Finish this interview?'),
        finishFailed: everyLocale(
          localization,
          'The interview could not be finished.',
        ),
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
      options: [{ en: 'Close' }, { en: 'Distant' }],
    },
  );

const bilingual = () =>
  protocolIn(
    { defaultLocale: 'en', locales: ['en', 'fr'] },
    {
      stage: { en: 'Welcome', fr: 'Bienvenue' },
      title: { en: 'Hello', fr: 'Bonjour' },
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
        wording: familyPedigreeWordingIn(),
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
        content: {
          'en': DEFAULT_FINISH_SESSION_TEXT.en.content,
          'pt-BR': DEFAULT_FINISH_SESSION_TEXT['pt-BR'].content,
        },
        finishedContent: {
          'en': DEFAULT_FINISH_SESSION_TEXT.en.finishedContent,
          'pt-BR': DEFAULT_FINISH_SESSION_TEXT['pt-BR'].finishedContent,
        },
      });
      expect(Object.keys(finish?.label ?? {})).not.toContain('ja');
      expect(protocol.stages[0]).toEqual(withSuppliedFinish().stages[0]);
      expect((await validateProtocol(protocol)).success).toBe(true);
    });

    it('gets that text in each new language even once the researcher has rewritten it, and keeps their translations', () => {
      const edited = withSuppliedFinish();
      const finish = edited.stages.at(-1);
      if (finish?.type !== 'FinishSession') throw new Error('No finish stage');
      edited.localization = { defaultLocale: 'en', locales: ['en', 'fr'] };
      edited.stages = [
        ...edited.stages.slice(0, -1),
        {
          ...finish,
          label: { en: 'Wrap up' },
          content: { en: 'Thanks for taking part.', fr: 'Merci beaucoup.' },
          finishedContent: { en: 'All done.' },
        },
      ];
      const protocol = protocolOf(addLocales(edited, ['de', 'ja']));
      const translated = protocol.stages.at(-1);
      if (translated?.type !== 'FinishSession') {
        throw new Error('No finish stage');
      }
      expect(protocol.stages.slice(0, -1)).toEqual(edited.stages.slice(0, -1));
      // French was already there, so it is neither overwritten nor filled
      // in; Japanese has no supplied text.
      expect(translated).toMatchObject({
        label: { en: 'Wrap up', de: DEFAULT_FINISH_SESSION_TEXT.de.label },
        content: {
          en: 'Thanks for taking part.',
          fr: 'Merci beaucoup.',
          de: DEFAULT_FINISH_SESSION_TEXT.de.content,
        },
        finishedContent: {
          en: 'All done.',
          de: DEFAULT_FINISH_SESSION_TEXT.de.finishedContent,
        },
      });
      expect(Object.keys(translated.label)).toEqual(['en', 'de']);
      expect(Object.keys(translated.finishedContent)).toEqual(['en', 'de']);
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

    it('get their supplied labels in each new language even once the researcher has reworded one', () => {
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
        PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
          en:
            value === 'intersex'
              ? 'Intersex or variation of sex'
              : suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
          es: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'es'),
        })),
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
  // The interface text the protocol holds in French: none, since Network
  // Canvas supplies it there and the protocol holds only its author's own.
  const frenchInterfaceText = collectLocalizedStrings(bilingual()).filter(
    ({ path, value }) => path[0] === 'interfaceText' && 'fr' in value,
  ).length;

  it('counts the translations a removal deletes', () => {
    expect(frenchInterfaceText).toBe(0);
    expect(
      getLocaleRemovalImpact(collectLocalizedStrings(bilingual()), 'fr')
        .translationCount,
      // Six texts of the protocol's own and the finish stage's three settings.
    ).toBe(9 + frenchInterfaceText);
  });

  it('counts each text once however many readings of it there are', () => {
    // The stage's title as the protocol holds it, and as an open editor holds
    // it unsaved, with the English deleted.
    const unsaved: LocalizedStringHit = {
      path: ['stages', 0, 'title'],
      value: { fr: 'Bonjour' },
      format: 'plain',
      lines: 'single',
    };
    const impact = getLocaleRemovalImpact(
      [...collectLocalizedStrings(bilingual()), unsaved],
      'fr',
    );

    expect(impact.translationCount).toBe(9 + frenchInterfaceText);
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

  it('removes the only language a text Network Canvas words was reworded in, which then reads as Network Canvas words it', () => {
    // The protocol's own wording for the Back button is only in French.
    const reworded = {
      ...bilingual(),
      interfaceText: { navigation: { back: { fr: 'Précédent' } } },
    };
    const back = collectLocalizedStrings(reworded).filter(
      ({ path }) => path[0] === 'interfaceText',
    );
    expect(back.map(({ value }) => value)).toEqual([{ fr: 'Précédent' }]);

    // Network Canvas has English for it, so nothing is left without text;
    // without that wording counted, the removal would strand it.
    expect(getLocaleRemovalImpact(back, 'fr').strandedStrings).toEqual(back);
    const removed = protocolOf(removeLocale(reworded, 'fr'));
    expect(removed.localization.locales).toEqual(['en']);
    expect(removed.interfaceText).toBeUndefined();
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

// Swahili is a language Network Canvas has no wording in, so a protocol
// whose default language it is names a fallback language.
describe('the fallback language', () => {
  const withSwahili = () => protocolOf(addLocales(bilingual(), ['sw']));
  const swahiliDefault = () =>
    protocolOf(setDefaultLocale(withSwahili(), 'sw'));
  const fallingBackToSpanish = () =>
    protocolOf(setFallbackLocale(swahiliDefault(), 'es'));

  it('is not chosen for the researcher when the default language comes to need one', () => {
    expect(swahiliDefault().localization).toEqual({
      defaultLocale: 'sw',
      locales: ['en', 'fr', 'sw'],
    });
  });

  it('is named by the researcher, and need not be a language the protocol declares', () => {
    expect(fallingBackToSpanish().localization).toEqual({
      defaultLocale: 'sw',
      locales: ['en', 'fr', 'sw'],
      fallbackLocale: 'es',
    });
  });

  it('can be changed to another language Network Canvas has wording in', () => {
    expect(
      protocolOf(setFallbackLocale(fallingBackToSpanish(), 'fr')).localization
        .fallbackLocale,
    ).toBe('fr');
  });

  it.each(['sw', 'es-MX', 'ja', ''])(
    'is refused when it is not a language Network Canvas has wording in (%s)',
    (locale) => {
      expect(setFallbackLocale(swahiliDefault(), locale)).toEqual({
        ok: false,
        reason: 'not-fallback-choice',
      });
    },
  );

  it('is refused while the default language is one Network Canvas has wording in', () => {
    expect(setFallbackLocale(withSwahili(), 'es')).toEqual({
      ok: false,
      reason: 'not-fallback-choice',
    });
  });

  it('is kept when languages are added and removed', () => {
    const added = protocolOf(addLocales(fallingBackToSpanish(), ['de']));
    expect(added.localization.fallbackLocale).toBe('es');
    expect(
      protocolOf(removeLocale(added, 'de')).localization.fallbackLocale,
    ).toBe('es');
  });

  it('is kept when another language Network Canvas has no wording in becomes the default', () => {
    const withJapanese = protocolOf(addLocales(fallingBackToSpanish(), ['ja']));
    expect(
      protocolOf(setDefaultLocale(withJapanese, 'ja')).localization,
    ).toEqual({
      defaultLocale: 'ja',
      locales: ['en', 'fr', 'sw', 'ja'],
      fallbackLocale: 'es',
    });
  });

  it('goes when a language Network Canvas has wording in becomes the default', async () => {
    const english = protocolOf(setDefaultLocale(fallingBackToSpanish(), 'en'));
    expect(english.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'fr', 'sw'],
    });
    expect((await validateProtocol(english, { draft: true })).success).toBe(
      true,
    );
  });

  it('goes when the default language is corrected to one Network Canvas has wording in', () => {
    expect(
      protocolOf(changeLocale(fallingBackToSpanish(), 'sw', 'de')).localization,
    ).toEqual({ defaultLocale: 'de', locales: ['en', 'fr', 'de'] });
  });

  it('is not chosen when the default language is corrected to one Network Canvas has no wording in', () => {
    expect(
      protocolOf(changeLocale(bilingual(), 'en', 'en-GB')).localization,
    ).toEqual({ defaultLocale: 'en-GB', locales: ['en-GB', 'fr'] });
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
    for (const text of ['', '   ', '\n\t', '\u200B\u00AD']) {
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
      content: { de: DEFAULT_FINISH_SESSION_TEXT.de.content },
      finishedContent: { de: DEFAULT_FINISH_SESSION_TEXT.de.finishedContent },
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

  it('moves what the researcher wrote unchanged, and gives what is still Network Canvas’s the corrected language’s wording', () => {
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
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        de:
          value === 'intersex'
            ? 'Intersex or variation of sex'
            : suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'de'),
      })),
    );
  });

  it('changes nothing but the default when the default changes, and nothing but the removed translations when a language is removed', () => {
    // A protocol whose French lacks the supplied labels, as when a researcher
    // cleared them: neither operation adds a language, so neither fills them.
    const english = withPedigree();
    const french: CurrentProtocol = {
      ...english,
      localization: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
    };
    // The fixture's stage holds Network Canvas's own wording, which a stored
    // protocol does not: each result is compared with the fixture as stored.
    const stored = withoutSuppliedWording(french);
    const frenchDefault = protocolOf(setDefaultLocale(french, 'fr'));
    expect(frenchDefault.codebook).toEqual(french.codebook);
    expect(frenchDefault.stages).toEqual(stored.stages);
    const withoutGerman = protocolOf(removeLocale(french, 'de'));
    expect(withoutGerman.codebook).toEqual(french.codebook);
    expect(withoutGerman.stages).toEqual(stored.stages);
  });

  it('leaves a new default language with no built-in labels without them, and still fills in a language added later', () => {
    const withHungarian = protocolOf(addLocales(withPedigree(), ['hu']));
    const huDefault = protocolOf(setDefaultLocale(withHungarian, 'hu'));
    expect(labelsOf(huDefault, 'node', 'relative', 'sex')).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
      })),
    );
    const withGerman = protocolOf(addLocales(huDefault, ['de']));
    expect(labelsOf(withGerman, 'node', 'relative', 'sex')).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
        de: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'de'),
      })),
    );
  });
});

describe('a roster stage’s supplied panel title', () => {
  const withRoster = (panelTitle?: Record<string, string>): CurrentProtocol =>
    ({
      ...monolingual(),
      stages: [
        {
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: { en: 'Services' },
          subject: { entity: 'node', type: 'person' },
          dataSource: 'roster',
          ...(panelTitle === undefined ? {} : { panelTitle }),
          prompts: [{ id: 'p1', text: { en: 'Which services?' } }],
        },
      ],
    }) as unknown as CurrentProtocol;
  const panelTitleOf = (protocol: CurrentProtocol) =>
    (protocol.stages[0] as { panelTitle?: unknown }).panelTitle;
  /** The panel title the interview shows: the protocol's, or Network Canvas's. */
  const shownPanelTitle = (protocol: CurrentProtocol) =>
    panelTitleOf(withSuppliedWording(protocol));

  it('is written into no language, and reads in a new or corrected one as Network Canvas words it', () => {
    const french = protocolOf(addLocales(withRoster(), ['fr']));
    expect(panelTitleOf(french)).toBeUndefined();
    expect(shownPanelTitle(french)).toEqual({
      en: 'Available to add',
      fr: 'Éléments disponibles',
    });

    const german = protocolOf(changeLocale(withRoster(), 'en', 'de'));
    expect(panelTitleOf(german)).toBeUndefined();
    expect(shownPanelTitle(german)).toEqual({ de: 'Zum Hinzufügen verfügbar' });
  });

  it('keeps the researcher’s own wording in a new language, which reads Network Canvas’s beside it', () => {
    const added = protocolOf(
      addLocales(withRoster({ en: 'Services' }), ['fr', 'ja']),
    );
    expect(panelTitleOf(added)).toEqual({ en: 'Services' });
    expect(shownPanelTitle(added)).toEqual({
      en: 'Services',
      fr: 'Éléments disponibles',
    });
  });

  // Network Canvas has no wording in this language, so the researcher writes
  // it; until then the protocol can't be downloaded.
  it('is left for the researcher to write when the protocol’s only language is corrected to one Network Canvas has no wording in', () => {
    const corrected = protocolOf(changeLocale(withRoster(), 'en', 'hu'));
    expect(panelTitleOf(corrected)).toBeUndefined();
    expect(shownPanelTitle(corrected) ?? {}).toEqual({});
  });
});

describe('the interview’s shared words', () => {
  const withBack = (back?: Record<string, string>): CurrentProtocol =>
    ({
      ...monolingual(),
      ...(back === undefined
        ? {}
        : { interfaceText: { navigation: { back } } }),
    }) as unknown as CurrentProtocol;
  const backOf = (protocol: CurrentProtocol) =>
    protocol.interfaceText?.navigation?.back;
  /** The Back button text the interview shows. */
  const shownBackOf = (protocol: CurrentProtocol) =>
    withSuppliedWording(protocol).interfaceText?.navigation?.back;

  it('are written into no language, and read in a new or corrected one as Network Canvas words them', () => {
    const french = protocolOf(addLocales(withBack(), ['fr']));
    expect(backOf(french)).toBeUndefined();
    expect(shownBackOf(french)).toEqual({ en: 'Back', fr: 'Retour' });

    const german = protocolOf(changeLocale(withBack(), 'en', 'de'));
    expect(backOf(german)).toBeUndefined();
    expect(shownBackOf(german)).toEqual({ de: 'Zurück' });
  });

  it('keep the researcher’s rewording in a new language, which reads Network Canvas’s beside it', () => {
    const added = protocolOf(addLocales(withBack({ en: 'Previous' }), ['fr']));
    expect(backOf(added)).toEqual({ en: 'Previous' });
    expect(shownBackOf(added)).toEqual({ en: 'Previous', fr: 'Retour' });
  });

  it('keep the researcher’s own words when their language is corrected to one Network Canvas has no wording in', () => {
    const reworded = {
      ...monolingual(),
      interfaceText: { navigation: { continue: { en: 'Next' } } },
    } as unknown as CurrentProtocol;
    const corrected = protocolOf(changeLocale(reworded, 'en', 'hu'));
    expect(corrected.interfaceText?.navigation).toEqual({
      continue: { hu: 'Next' },
    });
    expect(shownBackOf(corrected) ?? {}).toEqual({});
  });

  it('gain nothing in a new language Network Canvas has no wording in', () => {
    expect(
      backOf(protocolOf(addLocales(withBack({ en: 'Previous' }), ['ja']))),
    ).toEqual({ en: 'Previous' });
  });
});
