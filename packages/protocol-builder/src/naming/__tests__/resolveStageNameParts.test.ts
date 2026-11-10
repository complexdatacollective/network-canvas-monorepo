import { describe, expect, it } from 'vitest';

import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from '../resolveStageNameParts.ts';
import { stageNameLanguageOf } from '../stageNameLanguage.ts';

const languageOf = (defaultLocale: string) => {
  const language = stageNameLanguageOf({
    defaultLocale,
    locales: [defaultLocale],
  });
  if (language === undefined) throw new Error(`no wording in ${defaultLocale}`);
  return language;
};

const english = languageOf('en');

const nameByType: Record<string, string> = {
  person: 'Person',
  friendship: 'Friendship',
};
const resolveEntityName = (_entity: 'node' | 'edge', type: string) =>
  nameByType[type] ?? null;

describe('resolveStageSubjectName', () => {
  it('resolves a node subject', () => {
    expect(
      resolveStageSubjectName(
        { entity: 'node', type: 'person' },
        resolveEntityName,
      ),
    ).toBe('Person');
  });
  it('resolves an edge subject', () => {
    expect(
      resolveStageSubjectName(
        { entity: 'edge', type: 'friendship' },
        resolveEntityName,
      ),
    ).toBe('Friendship');
  });
  it('returns null for ego and for missing/unknown subjects', () => {
    expect(
      resolveStageSubjectName({ entity: 'ego' }, resolveEntityName),
    ).toBeNull();
    expect(resolveStageSubjectName(undefined, resolveEntityName)).toBeNull();
    expect(
      resolveStageSubjectName(
        { entity: 'node', type: 'ghost' },
        resolveEntityName,
      ),
    ).toBeNull();
  });
});

describe('resolveStageQualifier', () => {
  const resolvers = {
    resolveAssetType: () => null,
  };

  it('classifies name-generator panels by data source', () => {
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ dataSource: 'existing' }],
        },
        resolvers,
        english,
      )?.full,
    ).toBe('with Network Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ dataSource: 'roster-1' }],
        },
        resolvers,
        english,
      )?.full,
    ).toBe('with Roster Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGeneratorQuickAdd',
          panels: [{ dataSource: 'existing' }, { dataSource: 'roster-1' }],
        },
        resolvers,
        english,
      )?.full,
    ).toBe('with Panels');
    expect(
      resolveStageQualifier(
        { type: 'NameGenerator', panels: [] },
        resolvers,
        english,
      ),
    ).toBeNull();
  });

  it('lists Information asset media types via the manifest', () => {
    const r = {
      ...resolvers,
      resolveAssetType: (id: string) => (id === 'a1' ? 'video' : 'image'),
    };
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [{ id: 'i1', type: 'asset', content: 'a1' }],
        },
        r,
        english,
      )?.full,
    ).toBe('with Video');
    // Media types are emitted in a canonical order (Image, Video, Audio), so
    // the same assets produce the same name regardless of item order.
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [
            { id: 'i1', type: 'asset', content: 'a1' },
            { id: 'i2', type: 'asset', content: 'a2' },
          ],
        },
        r,
        english,
      )?.full,
    ).toBe('with Image & Video');
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [
            { id: 'i2', type: 'asset', content: 'a2' },
            { id: 'i1', type: 'asset', content: 'a1' },
          ],
        },
        r,
        english,
      )?.full,
    ).toBe('with Image & Video');
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [{ id: 'i1', type: 'text', content: { en: 'hello' } }],
        },
        r,
        english,
      ),
    ).toBeNull();
  });

  it('qualifies a finish stage by its outcome, and says when it ends unasked', () => {
    expect(
      resolveStageQualifier(
        { type: 'FinishSession', mode: 'confirmation', outcome: 'completed' },
        resolvers,
        english,
      ),
    ).toEqual({ full: '(Completed)', summary: '(Completed)' });
    expect(
      resolveStageQualifier(
        { type: 'FinishSession', mode: 'automatic', outcome: 'terminated' },
        resolvers,
        english,
      ),
    ).toEqual({ full: '(Ended Early, Automatic)', summary: '(Ended Early)' });
    expect(
      resolveStageQualifier({ type: 'FinishSession' }, resolvers, english),
    ).toBeNull();
  });

  it('returns null for stage types without qualifiers', () => {
    expect(
      resolveStageQualifier({ type: 'Sociogram' }, resolvers, english),
    ).toBeNull();
  });
});

describe('a qualifier follows the language it is in', () => {
  const resolvers = { resolveAssetType: () => null };
  const media = (locale: string) => {
    const types: Record<string, string> = {
      a1: 'video',
      a2: 'image',
      a3: 'audio',
    };
    return resolveStageQualifier(
      {
        type: 'Information',
        items: [
          { id: 'i1', type: 'asset', content: 'a1' },
          { id: 'i2', type: 'asset', content: 'a2' },
          { id: 'i3', type: 'asset', content: 'a3' },
        ],
      },
      { resolveAssetType: (id: string) => types[id] ?? null },
      languageOf(locale),
    );
  };

  it('words panels in the default language', () => {
    expect(
      resolveStageQualifier(
        { type: 'NameGenerator', panels: [{ dataSource: 'roster-1' }] },
        resolvers,
        languageOf('es'),
      )?.full,
    ).toBe('con paneles de la lista');
  });

  it('lists every medium in the language, with its own conjunction', () => {
    expect(media('en')).toEqual({
      full: 'with Image, Video & Audio',
      summary: 'with Media',
    });
    expect(media('de')).toEqual({
      full: 'mit Bild, Video und Audio',
      summary: 'mit Medien',
    });
    expect(media('zh-Hans')).toEqual({
      full: '含图像、视频和音频',
      summary: '含多媒体',
    });
  });

  it('words how a finish stage ends in the language', () => {
    expect(
      resolveStageQualifier(
        { type: 'FinishSession', mode: 'automatic', outcome: 'completed' },
        resolvers,
        languageOf('fr'),
      ),
    ).toEqual({
      full: 'entretien terminé, sans demande de confirmation',
      summary: 'entretien terminé',
    });
    expect(
      resolveStageQualifier(
        { type: 'FinishSession', mode: 'automatic' },
        resolvers,
        languageOf('es'),
      ),
    ).toEqual({
      full: 'sin pedir confirmación',
      summary: 'sin pedir confirmación',
    });
  });
});
