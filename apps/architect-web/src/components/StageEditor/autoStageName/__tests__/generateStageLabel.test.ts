import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import {
  composeStageName,
  dedupeStageLabel,
  generateStageLabel,
  MAX_LABEL_LENGTH,
  STAGE_TYPE_NAMES,
} from '../generateStageLabel';

describe('composeStageName', () => {
  it('joins subject, type, and qualifier with spaces', () => {
    expect(
      composeStageName({
        subjectName: 'Person',
        typeName: 'Form Name Generator',
        qualifier: 'with Roster Panels',
      }),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('omits empty subject and qualifier', () => {
    expect(
      composeStageName({
        subjectName: null,
        typeName: 'Ego Form',
        qualifier: null,
      }),
    ).toBe('Ego Form');
  });
});

describe('dedupeStageLabel', () => {
  it('returns the base when free', () => {
    expect(dedupeStageLabel('Person Sociogram', ['Other'])).toBe(
      'Person Sociogram',
    );
  });
  it('appends the lowest free number on collision, case-insensitively', () => {
    expect(dedupeStageLabel('Person Sociogram', ['person sociogram'])).toBe(
      'Person Sociogram #2',
    );
  });
  it('fills numbering gaps', () => {
    expect(dedupeStageLabel('A', ['A', 'A #3'])).toBe('A #2');
  });
});

describe('generateStageLabel', () => {
  it('builds a full name', () => {
    expect(
      generateStageLabel({
        typeName: 'Form Name Generator',
        subjectName: 'Person',
        qualifier: {
          full: 'with Roster Panels',
          summary: 'with Roster Panels',
        },
        existingLabels: [],
      }),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('summarizes a listed qualifier when too long, before dropping the subject', () => {
    const label = generateStageLabel({
      typeName: 'Family Pedigree',
      subjectName: 'Extended Family Member Person',
      qualifier: {
        full: 'with Diabetes, Hypertension & Coronary Heart Disease Nominations',
        summary: 'with Nominations',
      },
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    expect(label).toContain('with Nominations');
  });
  it('never exceeds the length cap even with a dedup suffix', () => {
    const long = 'X'.repeat(60);
    const label = generateStageLabel({
      typeName: long,
      subjectName: null,
      qualifier: null,
      existingLabels: [long.slice(0, 50)],
    });
    expect(label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
  });
});

describe('STAGE_TYPE_NAMES', () => {
  it('has the expected concise names', () => {
    const expected: Record<StageType, string> = {
      NameGenerator: 'Form Name Generator',
      NameGeneratorQuickAdd: 'Quick Add Name Generator',
      NameGeneratorRoster: 'Roster Name Generator',
      FamilyPedigree: 'Family Pedigree',
      NarrativePedigree: 'Narrative Pedigree',
      DyadCensus: 'Dyad Census',
      OneToManyDyadCensus: 'One to Many Dyad Census',
      TieStrengthCensus: 'Tie-Strength Census',
      Sociogram: 'Sociogram',
      Narrative: 'Narrative',
      OrdinalBin: 'Ordinal Bin',
      CategoricalBin: 'Categorical Bin',
      AlterForm: 'Per Alter Form',
      Geospatial: 'Geospatial',
      AlterEdgeForm: 'Per Alter Edge Form',
      EgoForm: 'Ego Form',
      Information: 'Information',
      Anonymisation: 'Anonymisation',
    };
    expect(STAGE_TYPE_NAMES).toStrictEqual(expected);
  });
});
