import { describe, expect, it } from 'vitest';

import { stageDocument } from '../stageDocument.ts';

describe('the stage document an editor saves', () => {
  it('drops a setting whose configuration is off, with the object it alone filled', () => {
    expect(
      stageDocument(
        { id: 'stage-1', type: 'Narrative' },
        {
          behaviours: { freeDraw: false, automaticLayout: false },
          tooltips: {
            pauseLayout: { en: 'Pause automatic layout' },
            resumeLayout: { en: 'Resume automatic layout' },
          },
        },
      ),
    ).toEqual({
      id: 'stage-1',
      type: 'Narrative',
      behaviours: { freeDraw: false, automaticLayout: false },
    });
  });

  it('keeps a setting while its configuration is on', () => {
    const fields = {
      behaviours: { automaticLayout: true },
      tooltips: {
        pauseLayout: { en: 'Pause automatic layout' },
        resumeLayout: { en: 'Resume automatic layout' },
      },
    };
    expect(stageDocument({ id: 'stage-1', type: 'Sociogram' }, fields)).toEqual(
      { id: 'stage-1', type: 'Sociogram', ...fields },
    );
  });
});
