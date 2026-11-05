import { describe, expect, it } from 'vitest';

import { typeScale } from '../shared/type-scale.ts';

describe('typeScale', () => {
  it('reads every step of the theme, smallest first', () => {
    expect(typeScale().map((step) => step.name)).toEqual([
      '2xs',
      'xs',
      'sm',
      'base',
      'lg',
      'xl',
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
    ]);
  });

  it('gives each step the size, leading and tracking its utility applies', () => {
    const base = typeScale().find((step) => step.name === 'base');
    expect(base).toEqual({
      name: 'base',
      fontSize: 'var(--theme-root-size)',
      lineHeight: '1.7',
      letterSpacing: '0',
    });
    for (const step of typeScale()) {
      expect(step.fontSize, step.name).toContain('var(--theme-root-size)');
      expect(step.fontSize, step.name).not.toMatch(/\s{2}|\( | \)/);
      expect(Number(step.lineHeight), step.name).toBeGreaterThan(1);
      expect(step.letterSpacing, step.name).toMatch(/^-?[\d.]+(em)?$/);
    }
  });
});
