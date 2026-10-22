import { describe, expect, it } from 'vitest';

import { withTranslation } from '../localizedText';

describe('withTranslation', () => {
  it('stores the text for the language, keeping the others', () => {
    expect(withTranslation({ en: 'Yes' }, 'fr', 'Oui')).toEqual({
      en: 'Yes',
      fr: 'Oui',
    });
  });

  it('removes the translation when the text is cleared', () => {
    expect(withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '')).toEqual({
      en: 'Yes',
    });
  });

  it('removes the translation when only whitespace is left', () => {
    // Kept, the language would read as translated and a participant reading
    // it would see blank text instead of the fallback.
    expect(withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '  \t ')).toEqual({
      en: 'Yes',
    });
  });

  // The schema refuses a translation of characters that show nothing, so
  // keeping one would leave the protocol invalid.
  it('removes the translation when only invisible characters are left', () => {
    expect(
      withTranslation({ en: 'Yes', fr: 'Oui' }, 'fr', '\u200b\u00a0'),
    ).toEqual({ en: 'Yes' });
  });

  it('leaves no translation at all as an empty string map', () => {
    expect(withTranslation({ en: 'Yes' }, 'en', ' ')).toEqual({});
  });
});
