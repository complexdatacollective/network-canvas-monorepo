import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import {
  getHasMissingTranslations,
  getLocalizationCoverage,
  getTranslationGroups,
} from '../issues';
import { getStageList } from '../protocol';

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
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          closeness: {
            name: 'closeness',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [{ value: 'close', label: { en: 'Close' } }],
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
      label: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' },
      title: { en: 'Hello', fr: 'Bonjour' },
      items: [],
    },
  ],
});

const trilingual = () =>
  protocolIn({ defaultLocale: 'en', locales: ['en', 'fr', 'de'] });

describe('getLocalizationCoverage()', () => {
  it('counts the texts translated into each declared language', () => {
    const coverage = getLocalizationCoverage(stateWith(trilingual()));

    // The attribute's one answer option, the stage's label and its title,
    // and the twenty-six words the interview itself shows (its navigation,
    // buttons and interviewer controls among them), which Network Canvas
    // supplies in all three languages.
    expect(coverage.total).toBe(29);
    expect(coverage.locales).toEqual([
      { locale: 'en', isDefault: true, translated: 29, missing: 0 },
      { locale: 'fr', isDefault: false, translated: 28, missing: 1 },
      { locale: 'de', isDefault: false, translated: 27, missing: 2 },
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
        key: 'stage:welcome',
        place: { kind: 'stage', stageId: 'welcome' },
        rows: [
          {
            path: ['stages', 0, 'label'],
            field: ['label'],
            format: 'plain',
            value: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' },
          },
          {
            path: ['stages', 0, 'title'],
            field: ['title'],
            format: 'plain',
            value: { en: 'Hello', fr: 'Bonjour' },
          },
        ],
      },
      {
        key: 'node:person',
        place: { kind: 'codebook', entity: 'node', entityType: 'person' },
        rows: [
          {
            path: [
              'codebook',
              'node',
              'person',
              'variables',
              'closeness',
              'options',
              0,
              'label',
            ],
            field: ['variables', 'closeness', 'options', 0, 'label'],
            format: 'markdown',
            value: { en: 'Close' },
          },
        ],
      },
    ]);
  });

  it('marks text participants see as markdown', () => {
    const protocol = trilingual();
    const withText: CurrentProtocol = {
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: 'intro',
          type: 'Information',
          label: { en: 'Intro', fr: 'Intro', de: 'Intro' },
          title: { en: 'About', fr: 'À propos', de: 'Über' },
          items: [
            {
              id: 'text',
              type: 'text',
              content: { en: 'Name **people**', fr: 'Nommez' },
            },
          ],
        },
      ],
    };

    const content = getTranslationGroups(stateWith(withText))
      .find(({ key }) => key === 'stage:intro')
      ?.rows.find(({ field }) => field.join('.') === 'items.0.content');

    expect(content).toEqual({
      path: ['stages', 1, 'items', 0, 'content'],
      field: ['items', 0, 'content'],
      format: 'markdown',
      value: { en: 'Name **people**', fr: 'Nommez' },
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
