import { describe, expect, it } from 'vitest';

import { headingWordUnits } from '../headingWords';

describe('headingWordUnits', () => {
  it('animates each word of a heading in the page’s direction on its own', () => {
    expect(headingWordUnits('Design your protocol', 'ltr')).toEqual([
      'Design',
      'your',
      'protocol',
    ]);
    expect(headingWordUnits('تصميم البروتوكول', 'rtl')).toEqual([
      'تصميم',
      'البروتوكول',
    ]);
  });

  it('keeps a run of Latin words in a right-to-left heading together, so they do not swap places', () => {
    expect(headingWordUnits('حول Network Canvas', 'rtl')).toEqual([
      'حول',
      'Network Canvas',
    ]);
    expect(
      headingWordUnits('ترقية Architect Classic إلى Schema 8', 'rtl'),
    ).toEqual(['ترقية', 'Architect Classic', 'إلى', 'Schema 8']);
  });

  it('keeps a run of right-to-left words in a left-to-right heading together', () => {
    expect(headingWordUnits('Say مرحبا بكم to everyone', 'ltr')).toEqual([
      'Say',
      'مرحبا بكم',
      'to',
      'everyone',
    ]);
  });
});
