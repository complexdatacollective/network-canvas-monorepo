import { describe, expect, it } from 'vitest';

import { familyPedigreeStage } from '../family-pedigree';

/**
 * Minimal valid FamilyPedigree stage base — after framing/boundaries become
 * mandatory fields they must be included here.
 */
const base = {
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree' as const,
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'label',
    egoVariable: 'isEgo',
    relationshipVariable: 'rel',
    biologicalSexVariable: 'bioSex',
  },
  edgeConfig: {
    type: 'family',
    relationshipTypeVariable: 'relType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGc',
    gameteRoleVariable: 'gameteRole',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed' as const, value: 'gamete' as const },
  boundaries: {
    requireGrandparents: 'off' as const,
    requireChildrenContributors: 'off' as const,
  },
};

describe('familyPedigreeStage framing/boundaries/introScreen', () => {
  it('accepts fixed framing with a value', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects fixed framing without a value', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        framing: { mode: 'fixed' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts participantChoice framing', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        framing: { mode: 'participantChoice' },
        boundaries: {
          requireGrandparents: 'required',
          requireChildrenContributors: 'recommended',
        },
      }).success,
    ).toBe(true);
  });

  it('requires both boundary keys', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        framing: { mode: 'participantChoice' },
        boundaries: { requireGrandparents: 'off' },
      }).success,
    ).toBe(false);
  });

  it('accepts an optional intro screen with content items', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        framing: { mode: 'participantChoice' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        introScreen: {
          items: [
            { id: 'text1', type: 'text', content: 'Welcome' },
            { id: 'video1', type: 'asset', content: 'assetId1' },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects the legacy intro screen text shape', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        introScreen: { text: 'Welcome' },
      }).success,
    ).toBe(false);
  });

  it('rejects intro screen items with duplicate ids', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        introScreen: {
          items: [
            { id: 'dup', type: 'text', content: 'One' },
            { id: 'dup', type: 'text', content: 'Two' },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects an empty censusPrompt', () => {
    expect(
      familyPedigreeStage.safeParse({ ...base, censusPrompt: '' }).success,
    ).toBe(false);
  });

  it('accepts a non-empty censusPrompt', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        censusPrompt: 'Build your family',
      }).success,
    ).toBe(true);
  });
});
