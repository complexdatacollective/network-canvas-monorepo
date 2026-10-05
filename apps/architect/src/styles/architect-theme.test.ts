import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ARCHITECT_THEME_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'architect-theme.css',
);

const readThemeToken = (name: string): string | undefined => {
  const css = readFileSync(ARCHITECT_THEME_PATH, 'utf8');
  const declaration = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css);
  return declaration?.[1]?.trim();
};

describe('Architect theme', () => {
  it('keeps neutral controls platinum against white dialog surfaces', () => {
    expect(readThemeToken('neutral')).toBe('oklch(var(--platinum))');
  });

  it('pairs the light nested surfaces with dark contrast text', () => {
    expect(readThemeToken('surface-3-contrast')).toBe(
      'oklch(var(--navy-taupe))',
    );
    expect(readThemeToken('surface-4-contrast')).toBe(
      'oklch(var(--navy-taupe))',
    );
  });
});
