import { describe, expect, it } from 'vitest';

import {
  collectLocalizedStrings,
  type CurrentProtocol,
  escapeMessageText,
  type LocalizedStringHit,
  messageText,
  validateProtocol,
} from '@codaco/protocol-validation';

import {
  addLocales,
  getLocaleRemovalImpact,
  type LocaleOperationResult,
  relabelledLocale,
  relabelLocale,
  removeLocale,
  rewriteLocalizedStrings,
  setDefaultLocale,
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
  ],
});

const migrated = () =>
  protocolIn(
    { defaultLocale: 'und', locales: ['und'] },
    {
      stage: { und: 'Welcome' },
      title: { und: 'Hello' },
      nodeType: { und: 'Person' },
      variable: 'Closeness',
      options: [{ und: 'Close' }, { und: 'Distant' }],
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

describe('addLocales', () => {
  it('declares languages after the existing ones, by their canonical tags', () => {
    const protocol = protocolOf(addLocales(bilingual(), ['PT-br', 'zh-hant']));

    expect(protocol.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'fr', 'pt-BR', 'zh-Hant'],
    });
    expect(textOf(protocol)).toEqual(textOf(bilingual()));
  });

  it('refuses a tag that is not a language, and adds none of the batch', () => {
    expect(addLocales(bilingual(), ['de', 'not a tag'])).toEqual({
      ok: false,
      reason: 'invalid-tag',
    });
  });

  it('never introduces the unidentified language', () => {
    expect(addLocales(bilingual(), ['und'])).toEqual({
      ok: false,
      reason: 'unspecified-tag',
    });
  });

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
    ).toBe(4);
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

    expect(impact.translationCount).toBe(4);
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

  it('moves translations to another language', () => {
    const [stage] = rewriteLocalizedStrings(
      stageFields(),
      relabelledLocale('fr', 'fr-CA'),
    ).stages;

    expect(stage?.label).toEqual({ 'en': 'Welcome', 'fr-CA': 'Bienvenue' });
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

describe('relabelLocale', () => {
  it('identifies migrated text as one language in a single step', async () => {
    const protocol = protocolOf(relabelLocale(migrated(), 'und', 'en'));

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

  it('moves a language that is not the default without touching the default', () => {
    const protocol = protocolOf(relabelLocale(bilingual(), 'fr', 'fr-CA'));

    expect(protocol.localization).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'fr-CA'],
    });
    expect(textOf(protocol).stage).toEqual({
      'en': 'Welcome',
      'fr-CA': 'Bienvenue',
    });
  });

  it('never merges one language into another', () => {
    expect(relabelLocale(bilingual(), 'fr', 'en')).toEqual({
      ok: false,
      reason: 'already-declared',
    });
  });

  it('refuses to mark text as the unidentified language', () => {
    expect(relabelLocale(bilingual(), 'fr', 'und')).toEqual({
      ok: false,
      reason: 'unspecified-tag',
    });
  });
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
