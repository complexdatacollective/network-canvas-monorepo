import { describe, expect, it } from 'vitest';

import { STAGE_TYPES } from '../../stage-types.ts';
import { getInterfaceTemplate } from '../templates.ts';

describe('getInterfaceTemplate', () => {
  it('answers with a template object for every stage type', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);
    for (const stageType of STAGE_TYPES) {
      const template = getInterfaceTemplate(stageType);
      expect(template, stageType).toBeTypeOf('object');
      expect(Array.isArray(template), stageType).toBe(false);
    }
  });

  it('answers with an empty template for an interface that authors no defaults', () => {
    expect(getInterfaceTemplate('Sociogram')).toEqual({});
    expect(getInterfaceTemplate('NameGenerator')).toEqual({});
    // Listed in the map, but deliberately empty.
    expect(getInterfaceTemplate('AlterForm')).toEqual({});
  });

  /**
   * These are the authored defaults, not schema defaults: leaving one unset
   * produces a schema-valid stage that behaves differently from the interface
   * a researcher chose. `automaticLayout` in particular is load-bearing for
   * Architect's e2e protocol normalizer, which treats a persisted
   * `automaticLayout: false` as equivalent to the key being absent precisely
   * because the template seeds `true`.
   */
  it('seeds the layout and consideration behaviours their interfaces are designed around', () => {
    expect(getInterfaceTemplate('Narrative')).toEqual({
      behaviours: { allowRepositioning: true, automaticLayout: true },
    });
    expect(getInterfaceTemplate('NetworkComposer')).toEqual({
      behaviours: { automaticLayout: true },
    });
    expect(getInterfaceTemplate('OneToManyDyadCensus')).toEqual({
      behaviours: { removeAfterConsideration: true },
    });
  });

  it('seeds the pedigree interfaces with their framing, boundaries and intro copy', () => {
    const familyPedigree = getInterfaceTemplate('FamilyPedigree');
    expect(familyPedigree.framing).toEqual({ mode: 'fixed', value: 'gamete' });
    expect(familyPedigree.boundaries).toEqual({
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    });
    // The intro screen is a content list, so assert its shape rather than
    // restating the researcher-facing copy here.
    expect(familyPedigree.introScreen).toMatchObject({
      items: [{ id: 'intro-text', type: 'text' }],
    });
    const introItems = (
      familyPedigree.introScreen as { items: { content: string }[] }
    ).items;
    expect(introItems[0]?.content.trim()).not.toBe('');

    expect(getInterfaceTemplate('NarrativePedigree')).toEqual({
      sourceStageId: '',
      diseases: [],
      showAtRiskStatuses: false,
    });
  });
});
