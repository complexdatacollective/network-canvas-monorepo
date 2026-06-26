import { describe, expect, it } from 'vitest';

import {
  buildListQualifier,
  resolveStageQualifier,
  resolveStageSubjectName,
} from '../resolveStageNameParts';

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

describe('buildListQualifier', () => {
  it('returns null for no values', () => {
    expect(buildListQualifier([], { summaryNoun: 'Media' })).toBeNull();
  });
  it('lists up to three values with an ampersand', () => {
    expect(
      buildListQualifier(['Image', 'Video'], { summaryNoun: 'Media' }),
    ).toStrictEqual({
      full: 'with Image & Video',
      summary: 'with Media',
    });
    expect(
      buildListQualifier(['A', 'B', 'C'], { summaryNoun: 'Media' })?.full,
    ).toBe('with A, B & C');
  });
  it('summarizes four or more values', () => {
    expect(
      buildListQualifier(['A', 'B', 'C', 'D'], { summaryNoun: 'Media' }),
    ).toStrictEqual({
      full: 'with Media',
      summary: 'with Media',
    });
  });
  it('applies singular/plural nouns and de-duplicates', () => {
    expect(
      buildListQualifier(['Diabetes'], {
        singularNoun: 'Nomination',
        pluralNoun: 'Nominations',
        summaryNoun: 'Nominations',
      })?.full,
    ).toBe('with Diabetes Nomination');
    expect(
      buildListQualifier(['Diabetes', 'Diabetes', 'Asthma'], {
        singularNoun: 'Nomination',
        pluralNoun: 'Nominations',
        summaryNoun: 'Nominations',
      })?.full,
    ).toBe('with Diabetes & Asthma Nominations');
  });
});

describe('resolveStageQualifier', () => {
  const resolvers = {
    resolveAssetType: () => null,
    resolveVariableName: () => null,
  };

  it('classifies name-generator panels by data source', () => {
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ id: 'p1', title: 'A', dataSource: 'existing' }],
        },
        resolvers,
      )?.full,
    ).toBe('with Network Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGenerator',
          panels: [{ id: 'p1', title: 'A', dataSource: 'roster-1' }],
        },
        resolvers,
      )?.full,
    ).toBe('with Roster Panels');
    expect(
      resolveStageQualifier(
        {
          type: 'NameGeneratorQuickAdd',
          panels: [
            { id: 'p1', title: 'A', dataSource: 'existing' },
            { id: 'p2', title: 'B', dataSource: 'roster-1' },
          ],
        },
        resolvers,
      )?.full,
    ).toBe('with Panels');
    expect(
      resolveStageQualifier({ type: 'NameGenerator', panels: [] }, resolvers),
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
      )?.full,
    ).toBe('with Video');
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
      )?.full,
    ).toBe('with Video & Image');
    expect(
      resolveStageQualifier(
        {
          type: 'Information',
          items: [{ id: 'i1', type: 'text', content: 'hello' }],
        },
        r,
      ),
    ).toBeNull();
  });

  it('lists Family Pedigree nominated attribute names via the codebook', () => {
    const r = {
      ...resolvers,
      resolveVariableName: (id: string) =>
        id === 'v1' ? 'Diabetes' : 'Asthma',
    };
    expect(
      resolveStageQualifier(
        { type: 'FamilyPedigree', nominationPrompts: [{ variable: 'v1' }] },
        r,
      )?.full,
    ).toBe('with Diabetes Nomination');
    expect(
      resolveStageQualifier(
        {
          type: 'FamilyPedigree',
          nominationPrompts: [{ variable: 'v1' }, { variable: 'v2' }],
        },
        r,
      )?.full,
    ).toBe('with Diabetes & Asthma Nominations');
  });

  it('returns null for stage types without qualifiers', () => {
    expect(resolveStageQualifier({ type: 'Sociogram' }, resolvers)).toBeNull();
  });
});
