import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import ProtocolSchemaV9 from '../schema.ts';
import {
  suppliedStageText,
  suppliedStageTextAfterLanguageChange,
} from '../supplied-stage-text.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const english = { defaultLocale: 'en', locales: ['en'] };

describe('the roster panel title Network Canvas supplies', () => {
  it('is written in each protocol language it is supplied in', () => {
    expect(
      suppliedStageText('NameGeneratorRoster', {
        defaultLocale: 'en-GB',
        locales: ['en-GB', 'es', 'hu'],
      }),
    ).toEqual([
      {
        path: ['panelTitle'],
        value: { 'en-GB': 'Available to add', 'es': 'Disponibles para añadir' },
      },
    ]);
  });

  it('is left for the researcher to write when no protocol language has it', () => {
    expect(
      suppliedStageText('NameGeneratorRoster', {
        defaultLocale: 'hu',
        locales: ['hu'],
      }),
    ).toEqual([]);
  });

  it('is supplied for no other stage', () => {
    expect(suppliedStageText('NameGenerator', english)).toEqual([]);
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
