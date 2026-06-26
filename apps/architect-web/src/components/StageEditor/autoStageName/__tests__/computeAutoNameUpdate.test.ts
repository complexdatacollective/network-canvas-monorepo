import { describe, expect, it } from 'vitest';

import { computeAutoNameUpdate } from '../computeAutoNameUpdate';

describe('computeAutoNameUpdate', () => {
  it('never auto-names an existing stage', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: false,
        isCustom: false,
        liveLabel: 'Existing',
        lastGenerated: undefined,
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('fills an empty label on first run', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: '',
        lastGenerated: undefined,
        generatedLabel: 'Form Name Generator',
      }),
    ).toStrictEqual({ nextIsCustom: false, label: 'Form Name Generator' });
  });

  it('updates the label when the generated name changes', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'Form Name Generator',
        lastGenerated: 'Form Name Generator',
        generatedLabel: 'Person Form Name Generator',
      }),
    ).toStrictEqual({
      nextIsCustom: false,
      label: 'Person Form Name Generator',
    });
  });

  it('locks when the researcher types a custom value', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'My stage',
        lastGenerated: 'Person Form Name Generator',
        generatedLabel: 'Person Form Name Generator',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('stays locked once custom', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: true,
        liveLabel: 'My stage',
        lastGenerated: 'Person Form Name Generator',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: true });
  });

  it('re-engages when the field is cleared', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: true,
        liveLabel: '   ',
        lastGenerated: 'My stage',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: false, label: 'Person Sociogram' });
  });

  it('does nothing when already in sync', () => {
    expect(
      computeAutoNameUpdate({
        isNewStage: true,
        isCustom: false,
        liveLabel: 'Person Sociogram',
        lastGenerated: 'Person Sociogram',
        generatedLabel: 'Person Sociogram',
      }),
    ).toStrictEqual({ nextIsCustom: false });
  });
});
