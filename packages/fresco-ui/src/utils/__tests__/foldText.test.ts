import { describe, expect, it } from 'vitest';

import { foldText } from '../foldText';

describe('foldText', () => {
  it('ignores case and accents', () => {
    expect(foldText('Localización')).toBe(foldText('LOCALIZACION'));
    expect(foldText('Crème Brûlée')).toBe('creme brulee');
  });

  it('lowercases with the rules of the given locale', () => {
    expect(foldText('I', 'tr')).toBe('ı');
    expect(foldText('I', 'en')).toBe('i');
  });
});
