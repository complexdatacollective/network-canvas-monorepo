import { describe, expect, it } from 'vitest';

import { missingSuppliedStageText } from '@codaco/protocol-validation';

import { stageDocument } from '../stageDocument.ts';

const ENGLISH = { defaultLocale: 'en', locales: ['en'] } as const;
const ENGLISH_AND_FRENCH = { defaultLocale: 'en', locales: ['en', 'fr'] };

describe('the stage document an editor saves', () => {
  it('drops a setting whose configuration is off, with the object it alone filled', () => {
    expect(
      stageDocument(
        { id: 'stage-1', type: 'Narrative' },
        {
          behaviours: { freeDraw: false, automaticLayout: false },
          tooltips: {
            enableDrawing: { en: 'Draw on the canvas' },
            disableDrawing: { en: 'Stop drawing' },
          },
        },
        undefined,
      ),
    ).toEqual({
      id: 'stage-1',
      type: 'Narrative',
      behaviours: { freeDraw: false, automaticLayout: false },
    });
  });

  it('keeps a setting while its configuration is on', () => {
    const fields = {
      behaviours: { freeDraw: true },
      tooltips: {
        enableDrawing: { en: 'Draw on the canvas' },
        disableDrawing: { en: 'Stop drawing' },
        freezeAnnotations: { en: 'Freeze the drawing' },
        unfreezeAnnotations: { en: 'Unfreeze the drawing' },
        resetAnnotations: { en: 'Clear the drawing' },
      },
    };
    expect(
      stageDocument({ id: 'stage-1', type: 'Narrative' }, fields, ENGLISH),
    ).toEqual({ id: 'stage-1', type: 'Narrative', ...fields });
  });

  it('writes a setting that applies and that the stage lacks, in the protocol’s languages', () => {
    const document = stageDocument(
      { id: 'stage-1', type: 'Narrative' },
      {
        behaviours: { freeDraw: true },
        tooltips: { enableDrawing: { en: 'Draw now' } },
      },
      ENGLISH_AND_FRENCH,
    );
    // The researcher's wording stays theirs.
    expect(document.tooltips).toMatchObject({
      enableDrawing: { en: 'Draw now' },
      disableDrawing: { en: expect.any(String), fr: expect.any(String) },
    });
    // Nothing that applies is left out.
    expect(
      missingSuppliedStageText(
        { ...document, type: 'Narrative' },
        ENGLISH_AND_FRENCH,
      ),
    ).toEqual([]);
  });

  it('writes nothing while the protocol’s languages are not known', () => {
    const fields = { behaviours: { freeDraw: true } };
    expect(
      stageDocument({ id: 'stage-1', type: 'Narrative' }, fields, undefined),
    ).toEqual({ id: 'stage-1', type: 'Narrative', ...fields });
  });

  it('writes a Family Pedigree’s gated wording once its configuration is on', () => {
    const document = stageDocument(
      { id: 'stage-1', type: 'FamilyPedigree' },
      { framing: 'participantPreference', wording: {} },
      ENGLISH,
    );
    expect(document.wording).toMatchObject({
      framingChoiceTitle: { en: expect.any(String) },
      framingChoiceDescription: { en: expect.any(String) },
      framingControlLabel: { en: expect.any(String) },
    });
  });
});
