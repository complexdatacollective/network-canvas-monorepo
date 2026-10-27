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

  test('ignores break points the wording carries, so every label breaks alike', () => {
    expect(shown(withKinshipBreaks('Biologi­cal father', 'en'))).toBe(
      'Bio|logical father',
    );
    expect(shown(withKinshipBreaks('Grand­son', 'en'))).toBe('Grandson');
  });

  test('uses the base language for a regional tag, and none for a language without breaks', () => {
    expect(shown(withKinshipBreaks('Mãe biológica', 'pt-BR'))).toBe(
      'Mãe bio|lógica',
    );
    expect(shown(withKinshipBreaks('Biological father', 'en-GB'))).toBe(
      'Bio|logical father',
    );
    expect(withKinshipBreaks('生­父', 'zh-Hans')).toBe('生父');
  });
});
