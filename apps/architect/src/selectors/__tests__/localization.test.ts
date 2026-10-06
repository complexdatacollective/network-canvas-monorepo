import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import {
  getHasMissingTranslations,
  getHasUnspecifiedLanguage,
  getLocalizationCoverage,
  getMissingTranslationGroups,
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
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          closeness: {
            name: 'closeness',
            label: 'Closeness',
            type: 'text',
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

    // The node type's label, the stage's label and its title. The attribute's
    // label is not translated, so it is not counted.
    expect(coverage.total).toBe(3);
    expect(coverage.locales).toEqual([
      { locale: 'en', isDefault: true, translated: 3, missing: 0 },
      { locale: 'fr', isDefault: false, translated: 2, missing: 1 },
      { locale: 'de', isDefault: false, translated: 1, missing: 2 },
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

describe('getMissingTranslationGroups()', () => {
  it('groups missing translations by the stage or codebook entry that holds them', () => {
    expect(getMissingTranslationGroups(stateWith(trilingual()))).toEqual([
      {
        key: 'node:person',
        place: { kind: 'codebook', entity: 'node', entityType: 'person' },
        fields: [
          {
            path: ['codebook', 'node', 'person', 'label'],
            field: ['label'],
            format: 'plain',
            value: { en: 'Person' },
            gaps: [
              { locale: 'fr', fallbackLocale: 'en' },
              { locale: 'de', fallbackLocale: 'en' },
            ],
          },
        ],
      },
      {
        key: 'stage:welcome',
        place: { kind: 'stage', stageId: 'welcome' },
        fields: [
          {
            path: ['stages', 0, 'title'],
            field: ['title'],
            format: 'plain',
            value: { en: 'Hello', fr: 'Bonjour' },
            gaps: [{ locale: 'de', fallbackLocale: 'en' }],
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

    const content = getMissingTranslationGroups(stateWith(withText))
      .find(({ key }) => key === 'stage:intro')
      ?.fields.find(({ field }) => field.join('.') === 'items.0.content');

    expect(content).toMatchObject({
      path: ['stages', 1, 'items', 0, 'content'],
      format: 'markdown',
      value: { en: 'Name **people**', fr: 'Nommez' },
      gaps: [{ locale: 'de', fallbackLocale: 'en' }],
    });
  });
});

describe('getHasUnspecifiedLanguage()', () => {
  it('is true while migrated text has no identified language', () => {
    const migrated: CurrentProtocol = {
      ...protocolIn({ defaultLocale: 'und', locales: ['und'] }),
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [
        {
          id: 'welcome',
          type: 'Information',
          label: { und: 'Welcome' },
          title: { und: 'Hello' },
          items: [],
        },
      ],
    };

    expect(getHasUnspecifiedLanguage(stateWith(migrated))).toBe(true);
    expect(getHasUnspecifiedLanguage(stateWith(trilingual()))).toBe(false);
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
