import { describe, expect, it } from 'vitest';

import {
  shapeMappingDraft,
  type ShapeMappingVariable,
} from '../../../../codebook/shapeMapping.ts';
import {
  pedigreeSymbolMapping,
  personSymbolState,
  type PersonSymbolInputs,
  sexAssignedAtBirthSymbol,
  shapeWithPedigreeSymbols,
} from '../personSymbols.ts';

const SEX: ShapeMappingVariable = {
  name: 'sex',
  type: 'categorical',
  options: [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'intersex', label: 'Intersex' },
  ],
};

const GENDER: ShapeMappingVariable = {
  name: 'gender',
  type: 'categorical',
  options: [
    { value: 'woman', label: 'Woman' },
    { value: 'man', label: 'Man' },
    { value: 'nonBinary', label: 'Non-binary' },
  ],
};

const TERMS = [
  { value: 'woman', words: 'feminine' },
  { value: 'man', words: 'masculine' },
  { value: 'nonBinary', words: 'neutral' },
];

const SEX_MAPPING = {
  variable: 'sex',
  type: 'discrete',
  map: [
    { value: 'female', shape: 'circle' },
    { value: 'male', shape: 'square' },
    { value: 'intersex', shape: 'diamond' },
  ],
};

const GENDER_MAPPING = {
  variable: 'gender',
  type: 'discrete',
  map: [
    { value: 'woman', shape: 'circle' },
    { value: 'man', shape: 'square' },
    { value: 'nonBinary', shape: 'diamond' },
  ],
};

const stateOf = (overrides: Partial<PersonSymbolInputs>) =>
  personSymbolState({
    shape: { default: 'circle' },
    variables: { sex: SEX, gender: GENDER },
    sexAssignedAtBirthAttribute: 'sex',
    genderIdentityAttribute: 'gender',
    genderTerms: TERMS,
    earlierGenderTerms: [],
    ...overrides,
  });

describe('the pedigree symbol mapping', () => {
  it('gives female a circle, male a square and every other option a diamond', () => {
    expect(pedigreeSymbolMapping('sex', SEX, sexAssignedAtBirthSymbol)).toEqual(
      SEX_MAPPING,
    );
  });

  it('makes the default a diamond and keeps the rest of the shape', () => {
    expect(
      shapeWithPedigreeSymbols(
        { default: 'circle', dynamic: GENDER_MAPPING },
        shapeMappingDraft(SEX_MAPPING),
      ),
    ).toEqual({ default: 'diamond', dynamic: SEX_MAPPING });
    expect(
      shapeWithPedigreeSymbols(
        { default: 'diamond', dynamic: SEX_MAPPING },
        undefined,
      ),
    ).toEqual({ default: 'diamond' });
  });
});

describe('what the symbols follow', () => {
  it('nothing, when there is no mapping', () => {
    expect(stateOf({ shape: { default: 'square' } })).toEqual({
      kind: 'notMapped',
      defaultShape: 'square',
    });
  });

  it('sex assigned at birth, drawn the standard way', () => {
    expect(
      stateOf({ shape: { default: 'diamond', dynamic: SEX_MAPPING } }),
    ).toEqual({ kind: 'sexAssignedAtBirth' });
  });

  it('sex assigned at birth, when options left to the diamond default have no entry', () => {
    expect(
      stateOf({
        shape: {
          default: 'diamond',
          dynamic: { ...SEX_MAPPING, map: SEX_MAPPING.map.slice(0, 2) },
        },
      }),
    ).toEqual({ kind: 'sexAssignedAtBirth' });
  });

  it('gender identity, drawn the standard way for its words now', () => {
    expect(
      stateOf({ shape: { default: 'diamond', dynamic: GENDER_MAPPING } }),
    ).toEqual({ kind: 'genderIdentity' });
  });

  it('one of those attributes drawn another way is custom', () => {
    expect(
      stateOf({
        shape: {
          default: 'diamond',
          dynamic: {
            ...SEX_MAPPING,
            map: [
              { value: 'female', shape: 'square' },
              { value: 'male', shape: 'circle' },
            ],
          },
        },
      }),
    ).toEqual({ kind: 'custom', source: 'sexAssignedAtBirth' });
    // The standard entries, but a default that draws everyone else otherwise.
    expect(
      stateOf({ shape: { default: 'circle', dynamic: GENDER_MAPPING } }),
    ).toEqual({ kind: 'custom', source: 'genderIdentity' });
    // A shape changed by hand, matching no words the stage has had.
    expect(
      stateOf({
        shape: {
          default: 'diamond',
          dynamic: {
            ...GENDER_MAPPING,
            map: [
              { value: 'woman', shape: 'circle' },
              { value: 'man', shape: 'square' },
              { value: 'nonBinary', shape: 'circle' },
            ],
          },
        },
        earlierGenderTerms: [TERMS],
      }),
    ).toEqual({ kind: 'custom', source: 'genderIdentity' });
  });

  it('another attribute', () => {
    expect(
      stateOf({
        shape: {
          default: 'diamond',
          dynamic: {
            variable: 'is_ego',
            type: 'discrete',
            map: [{ value: true, shape: 'square' }],
          },
        },
      }),
    ).toEqual({ kind: 'other', variableId: 'is_ego' });
    // Gender identity, once the stage no longer asks about it.
    expect(
      stateOf({
        shape: { default: 'diamond', dynamic: GENDER_MAPPING },
        genderIdentityAttribute: undefined,
      }),
    ).toEqual({ kind: 'other', variableId: 'gender' });
  });

  describe('gender identity symbols that are out of date', () => {
    it('after the words changed since the stage was saved', () => {
      expect(
        stateOf({
          shape: { default: 'diamond', dynamic: GENDER_MAPPING },
          genderTerms: [
            { value: 'woman', words: 'neutral' },
            { value: 'man', words: 'masculine' },
            { value: 'nonBinary', words: 'neutral' },
          ],
          earlierGenderTerms: [TERMS],
        }),
      ).toEqual({ kind: 'genderIdentityOutOfDate' });
    });

    it('after an option was added that takes gendered words', () => {
      expect(
        stateOf({
          shape: { default: 'diamond', dynamic: GENDER_MAPPING },
          variables: {
            sex: SEX,
            gender: {
              ...GENDER,
              options: [
                ...(GENDER.options ?? []),
                { value: 'transWoman', label: 'Trans woman' },
              ],
            },
          },
          genderTerms: [...TERMS, { value: 'transWoman', words: 'feminine' }],
        }),
      ).toEqual({ kind: 'genderIdentityOutOfDate' });
    });

    it('after the option an entry named was taken away and replaced', () => {
      expect(
        stateOf({
          shape: { default: 'diamond', dynamic: GENDER_MAPPING },
          variables: {
            sex: SEX,
            gender: {
              ...GENDER,
              options: [
                { value: 'female', label: 'Woman' },
                { value: 'man', label: 'Man' },
              ],
            },
          },
          genderTerms: [
            { value: 'female', words: 'feminine' },
            { value: 'man', words: 'masculine' },
          ],
        }),
      ).toEqual({ kind: 'genderIdentityOutOfDate' });
    });
  });
});
