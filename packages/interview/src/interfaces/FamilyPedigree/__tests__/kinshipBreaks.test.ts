import { describe, expect, test } from 'vitest';

import { withKinshipBreaks } from '../kinshipBreaks';

const shown = (text: string) => text.replaceAll('­', '|');

describe('withKinshipBreaks', () => {
  test('breaks a kinship word at the place set for its language, whatever its case', () => {
    expect(shown(withKinshipBreaks('Biological father', 'en'))).toBe(
      'Bio|logical father',
    );
    expect(shown(withKinshipBreaks('Maternal grandmother', 'en'))).toBe(
      'Maternal grand|mother',
    );
  });

  test('keeps the break points a word of the wording carries, and sets none of its own there', () => {
    expect(
      shown(withKinshipBreaks('Biolo\u00ADgical grand\u00ADfather', 'en')),
    ).toBe('Biolo|gical grand|father');
    // Only the word that carries them: the others still get the table's.
    expect(shown(withKinshipBreaks('Biological grand\u00ADfather', 'en'))).toBe(
      'Bio|logical grand|father',
    );
  });

  test('keeps the break points of wording in a language with none of its own', () => {
    expect(shown(withKinshipBreaks('Nagy\u00ADanya', 'hu'))).toBe('Nagy|anya');
    expect(withKinshipBreaks('Nagyanya', 'hu')).toBe('Nagyanya');
  });

  test('uses the base language for a regional tag, and none for a language without breaks', () => {
    expect(shown(withKinshipBreaks('Mãe biológica', 'pt-BR'))).toBe(
      'Mãe bio|lógica',
    );
    expect(shown(withKinshipBreaks('Biological father', 'en-GB'))).toBe(
      'Bio|logical father',
    );
    expect(withKinshipBreaks('生父', 'zh-Hans')).toBe('生父');
  });
});
