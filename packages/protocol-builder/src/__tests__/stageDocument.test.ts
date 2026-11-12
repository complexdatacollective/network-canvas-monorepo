import { describe, expect, it } from 'vitest';

import { missingSuppliedStageText } from '@codaco/protocol-validation';

import { stageDocument } from '../stageDocument.ts';

const ENGLISH = { defaultLocale: 'en', locales: ['en'] } as const;
const ENGLISH_AND_FRENCH = { defaultLocale: 'en', locales: ['en', 'fr'] };

describe('the stage document an editor saves', () => {
  it('drops a setting whose configuration is off', () => {
    expect(
      stageDocument(
        { id: 'stage-1', type: 'NameGenerator' },
        {
          behaviours: {},
          minNodesNotice: { en: 'Add at least {count}' },
        },
        undefined,
      ),
    ).toEqual({ id: 'stage-1', type: 'NameGenerator', behaviours: {} });
  });

  it('keeps a setting while its configuration is on', () => {
    const fields = {
      behaviours: { minNodes: 2, maxNodes: 5 },
      minNodesNotice: { en: 'Add at least {count}' },
      maxNodesNotice: { en: 'Add at most {count}' },
    };
    expect(
      stageDocument({ id: 'stage-1', type: 'NameGenerator' }, fields, ENGLISH),
    ).toMatchObject({ id: 'stage-1', type: 'NameGenerator', ...fields });
  });

  it('writes a setting that applies and that the stage lacks, in the protocol’s languages', () => {
    const document = stageDocument(
      { id: 'stage-1', type: 'NameGenerator' },
      {
        behaviours: { minNodes: 1, maxNodes: 3 },
        minNodesNotice: { en: 'Add one now' },
      },
      ENGLISH_AND_FRENCH,
    );
    // The researcher's wording stays theirs.
    expect(document).toMatchObject({
      minNodesNotice: { en: 'Add one now' },
      maxNodesNotice: { en: expect.any(String), fr: expect.any(String) },
    });
    // Nothing that applies is left out.
    expect(
      missingSuppliedStageText(
        { ...document, type: 'NameGenerator' },
        ENGLISH_AND_FRENCH,
      ),
    ).toEqual([]);
  });

  it('writes nothing while the protocol’s languages are not known', () => {
    const fields = { behaviours: { minNodes: 1 } };
    expect(
      stageDocument(
        { id: 'stage-1', type: 'NameGenerator' },
        fields,
        undefined,
      ),
    ).toEqual({ id: 'stage-1', type: 'NameGenerator', ...fields });
  });

  it('writes a Family Pedigree’s gated wording once its configuration is on', () => {
    const document = stageDocument(
      { id: 'stage-1', type: 'FamilyPedigree' },
      {
        nodeConfiguration: { genderIdentity: { variable: 'gender' } },
        wording: {},
      },
      ENGLISH,
    );
    expect(document.wording).toMatchObject({
      genderIdentityLabel: { en: expect.any(String) },
    });
  });
});
