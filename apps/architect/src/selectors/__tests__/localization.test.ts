import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  testId,
  testOptionId,
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  asEntityAttributeReference,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import {
  getHasMissingTranslations,
  getLocalizationCoverage,
  getTranslationGroups,
} from '../issues';
import { getStageList } from '../protocol';

const WELCOME_STAGE_ID = ProtocolObjectIdSchema.parse(
  '0f3fc844-4142-4d2d-81a9-48ea954ca4cf',
);
const INTRO_STAGE_ID = ProtocolObjectIdSchema.parse(
  'f88ffddb-1b3c-480e-8ed1-08162c3b3024',
);

const PERSON = testTypeId('person');
const CLOSENESS = testVariableId('closeness');

const stateWith = (protocol: CurrentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  return store.getState();
};

const protocolIn = (
  localization: CurrentProtocol['localization'],
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization,
  assetManifest: {},
  codebook: {
    node: {
      [PERSON]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [CLOSENESS]: {
            name: 'closeness',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              {
                id: testOptionId(CLOSENESS, 'close'),
                value: 'close',
                label: { en: 'Close' },
              },
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
      id: WELCOME_STAGE_ID,
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' },
      content: { en: '# Hello', fr: '# Bonjour' },
    },
  ],
});

const trilingual = () =>
  protocolIn({ defaultLocale: 'en', locales: ['en', 'fr', 'de'] });

describe('getLocalizationCoverage()', () => {
  it('counts the texts translated into each declared language', () => {
    const coverage = getLocalizationCoverage(stateWith(trilingual()));

    // The attribute's one answer option, the stage's label and its title,
    // and the twenty-two words the interview itself shows (its navigation,
    // buttons and interviewer controls among them), which Network Canvas
    // supplies in all three languages.
    expect(coverage.total).toBe(25);
    expect(coverage.locales).toEqual([
      { locale: 'en', isDefault: true, translated: 25, missing: 0 },
      { locale: 'fr', isDefault: false, translated: 24, missing: 1 },
      { locale: 'de', isDefault: false, translated: 23, missing: 2 },
    ]);
  });

  it('reports no missing translation for a protocol in one language', () => {
    const state = stateWith(
      protocolIn({ defaultLocale: 'en', locales: ['en'] }),
    );

    expect(getLocalizationCoverage(state).warnings).toEqual([]);
    expect(getHasMissingTranslations(state)).toBe(false);
  });

  it('flags missing translations as a warning only', () => {
    expect(getHasMissingTranslations(stateWith(trilingual()))).toBe(true);
  });
});

describe('getTranslationGroups()', () => {
  it('groups every text by the stage or codebook entry that holds it, stages first, and the interview’s own words last', () => {
    const groups = getTranslationGroups(stateWith(trilingual()));
    expect(groups.at(-1)).toMatchObject({
      key: 'interface',
      place: { kind: 'interface' },
    });
    expect(groups.at(-1)?.rows.map(({ field }) => field)).toContainEqual([
      'navigation',
      'back',
    ]);
    expect(groups.slice(0, -1)).toEqual([
      {
        key: `stage:${WELCOME_STAGE_ID}`,
        place: { kind: 'stage', stageId: WELCOME_STAGE_ID },
        rows: [
          {
            path: ['stages', 0, 'label'],
            field: ['label'],
            format: 'plain',
            lines: 'single',
            value: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' },
            // The declaration of the field it is in.
            schema: expect.anything(),
          },
          {
            path: ['stages', 0, 'content'],
            field: ['content'],
            format: 'markdown',
            lines: 'multiple',
            assetBlocks: true,
            // Every text that can show values offers them.
            dynamicValues: 'stageText',
            value: { en: '# Hello', fr: '# Bonjour' },
            // The declaration of the field it is in.
            schema: expect.anything(),
          },
        ],
      },
      {
        key: `node:${PERSON}`,
        place: { kind: 'codebook', entity: 'node', entityType: PERSON },
        rows: [
          {
            path: [
              'codebook',
              'node',
              PERSON,
              'variables',
              CLOSENESS,
              'options',
              0,
              'label',
            ],
            field: ['variables', CLOSENESS, 'options', 0, 'label'],
            format: 'markdown',
            lines: 'single',
            value: { en: 'Close' },
            // The declaration of the field it is in.
            schema: expect.anything(),
          },
        ],
      },
    ]);
  });

  it('marks text participants see as markdown, and how many lines it holds', () => {
    const protocol = trilingual();
    const withText: CurrentProtocol = {
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: INTRO_STAGE_ID,
          type: 'Information',
          label: { en: 'Intro', fr: 'Intro', de: 'Intro' },
          content: {
            en: '# About\n\nName **people**',
            fr: '# À propos\n\nNommez',
            de: '# Über',
          },
        },
      ],
    };

    const content = getTranslationGroups(stateWith(withText))
      .find(({ key }) => key === `stage:${INTRO_STAGE_ID}`)
      ?.rows.find(({ field }) => field.join('.') === 'content');

    expect(content).toEqual({
      path: ['stages', 1, 'content'],
      field: ['content'],
      format: 'markdown',
      lines: 'multiple',
      // The one text of an Information stage can show files as blocks.
      assetBlocks: true,
      dynamicValues: 'stageText',
      value: {
        en: '# About\n\nName **people**',
        fr: '# À propos\n\nNommez',
        de: '# Über',
      },
      // The declaration of the field it is in.
      schema: expect.anything(),
    });
  });

  /**
   * A text that can show values offers them to its translators whether or not
   * any text of its stage shows one yet: a translation may be the first.
   */
  describe('the texts of a stage that can show values', () => {
    const AGE = testVariableId('age');
    const withForm = (prompt: string): CurrentProtocol => {
      const protocol = trilingual();
      return {
        ...protocol,
        codebook: {
          ...protocol.codebook,
          ego: { variables: { [AGE]: { name: 'age', type: 'number' } } },
        },
        stages: [
          {
            id: INTRO_STAGE_ID,
            type: 'EgoForm',
            label: { en: 'About you' },
            introductionPanel: {
              title: { en: 'About you' },
              text: { en: 'A few questions.' },
            },
            form: {
              fields: [
                {
                  id: testId('field/age'),
                  variable: asEntityAttributeReference(AGE),
                  prompt: { en: prompt },
                  hint: { en: 'In whole years.' },
                },
              ],
            },
          },
        ],
      };
    };
    const hintRow = (protocol: CurrentProtocol) =>
      getTranslationGroups(stateWith(protocol))
        .find(({ key }) => key === `stage:${INTRO_STAGE_ID}`)
        ?.rows.find(({ field }) => field.at(-1) === 'hint');

    it('offers values in a text that names none, when another text of its stage names one', () => {
      expect(hintRow(withForm('How old are you on {now}?'))).toMatchObject({
        dynamicValues: 'formField',
      });
    });

    it('offers values where no text of its stage names one', () => {
      expect(hintRow(withForm('How old are you?'))).toMatchObject({
        dynamicValues: 'formField',
      });
    });
  });
});

describe('getStageList()', () => {
  it('labels each stage in the protocol default language', () => {
    expect(
      getStageList(
        stateWith(
          protocolIn({ defaultLocale: 'fr', locales: ['en', 'fr', 'de'] }),
        ),
      ).map(({ label }) => label),
    ).toEqual(['Bienvenue']);
  });

  it('falls back like the interview for a stage not yet translated into the default language', () => {
    const protocol = protocolIn({
      defaultLocale: 'de',
      locales: ['de', 'en'],
    });
    const untranslated: CurrentProtocol = {
      ...protocol,
      stages: protocol.stages.map((stage) => ({
        ...stage,
        label: { en: 'Welcome' },
      })),
    };

    expect(getStageList(stateWith(untranslated))[0]?.label).toBe('Welcome');
  });
});
