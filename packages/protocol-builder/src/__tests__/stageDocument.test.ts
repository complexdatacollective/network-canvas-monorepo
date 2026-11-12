import { describe, expect, it } from 'vitest';

import { suppliedStageText } from '@codaco/protocol-validation';

import {
  savedStageFields,
  stageDocument,
  stageFieldsForEditing,
} from '../stageDocument.ts';

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
      ),
    ).toEqual({ id: 'stage-1', type: 'NameGenerator', behaviours: {} });
  });

  it('keeps the researcher’s own wording for a setting while its configuration is on', () => {
    const fields = {
      behaviours: { minNodes: 2, maxNodes: 5 },
      minNodesNotice: { en: 'Add at least {count}' },
      maxNodesNotice: { en: 'Add at most {count}' },
    };
    expect(
      stageDocument({ id: 'stage-1', type: 'NameGenerator' }, fields),
    ).toMatchObject({ id: 'stage-1', type: 'NameGenerator', ...fields });
  });

  it('writes nothing for a setting that applies and that the stage lacks', () => {
    const document = stageDocument(
      { id: 'stage-1', type: 'NameGenerator' },
      {
        behaviours: { minNodes: 1, maxNodes: 3 },
        minNodesNotice: { en: 'Add one now' },
      },
    );
    // The researcher's wording stays theirs, and Network Canvas's is not held.
    expect(document).toEqual({
      id: 'stage-1',
      type: 'NameGenerator',
      behaviours: { minNodes: 1, maxNodes: 3 },
      minNodesNotice: { en: 'Add one now' },
    });
  });

  it('leaves out a translation that reads as Network Canvas words it, and keeps the researcher’s', () => {
    const wording = suppliedStageText('NameGenerator', ENGLISH_AND_FRENCH);
    const supplied = wording.find(
      ({ path }) => path.join('.') === 'maxNodesNotice',
    );
    expect(supplied?.value.en).toBeDefined();

    const document = stageDocument(
      { id: 'stage-1', type: 'NameGenerator' },
      {
        behaviours: { maxNodes: 3 },
        maxNodesNotice: { ...supplied?.value, fr: 'Assez, merci' },
      },
    );
    expect(document.maxNodesNotice).toEqual({ fr: 'Assez, merci' });
  });

  it('fills a stage for editing with Network Canvas’s wording in the protocol’s languages', () => {
    const fields = {
      behaviours: { minNodes: 1, maxNodes: 3 },
      minNodesNotice: { en: 'Add one now' },
    };
    const filled = stageFieldsForEditing(
      'NameGenerator',
      fields,
      ENGLISH_AND_FRENCH,
    );
    // The researcher's wording stays theirs.
    expect(filled).toMatchObject({
      minNodesNotice: { en: 'Add one now', fr: expect.any(String) },
      maxNodesNotice: { en: expect.any(String), fr: expect.any(String) },
    });
    // Saving it again stores only what the researcher wrote.
    expect(
      stageDocument({ id: 'stage-1', type: 'NameGenerator' }, filled),
    ).toEqual({
      id: 'stage-1',
      type: 'NameGenerator',
      behaviours: { minNodes: 1, maxNodes: 3 },
      minNodesNotice: { en: 'Add one now' },
    });
    // The fields given are left as they were.
    expect(fields).not.toHaveProperty('maxNodesNotice');
  });

  it('holds the stage as saved, without filling it, while the protocol’s languages are not known', () => {
    const fields = { behaviours: { minNodes: 1 } };
    expect(
      savedStageFields(
        { id: 'stage-1', type: 'NameGenerator' },
        fields,
        undefined,
      ),
    ).toEqual(fields);
  });

  it('holds the stage as saved, filled for editing, once the languages are known', () => {
    expect(
      savedStageFields(
        { id: 'stage-1', type: 'NameGenerator' },
        { behaviours: { minNodes: 1 } },
        ENGLISH,
      ),
    ).toMatchObject({
      behaviours: { minNodes: 1 },
      minNodesNotice: { en: expect.any(String) },
    });
  });

  it('shows a Family Pedigree’s gated wording only once its configuration is on, and stores none of it', () => {
    const fields = {
      nodeConfiguration: { genderIdentity: { variable: 'gender' } },
      wording: {},
    };
    const filled = stageFieldsForEditing('FamilyPedigree', fields, ENGLISH);
    expect(filled.wording).toMatchObject({
      genderIdentityLabel: { en: expect.any(String) },
    });
    expect(
      stageDocument({ id: 'stage-1', type: 'FamilyPedigree' }, filled).wording,
    ).toBeUndefined();
  });
});
