import { describe, expect, it } from 'vitest';

import { withLabelBreakPoints } from '../labelBreakPoints';

const SOFT_HYPHEN = '­';
const fragments = (text: string) => text.split(SOFT_HYPHEN);

describe('withLabelBreakPoints', () => {
  it.each([
    'Subramanian',
    'Bartholomew',
    'Fernandez',
    'Hyphenation',
    'Wolfeschlegelstein',
    'Konstantinopoulos',
    'Alexandra Müller-Lüdenscheidt',
    'María de los Ángeles Hernández García',
  ])('never changes the letters of %s', (name) => {
    expect(withLabelBreakPoints(name).replaceAll(SOFT_HYPHEN, '')).toBe(name);
  });

  it.each(['Subramanian', 'Bartholomew', 'Fernandez', 'Wolfeschlegelstein'])(
    'offers breaks in %s that leave at least three letters on each side',
    (name) => {
      const parts = fragments(withLabelBreakPoints(name));
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.at(0)!.length).toBeGreaterThanOrEqual(3);
      expect(parts.at(-1)!.length).toBeGreaterThanOrEqual(3);
    },
  );

  it('breaks at syllable points, not inside a digraph', () => {
    expect(withLabelBreakPoints('Subramanian')).toBe(
      `Subra${SOFT_HYPHEN}ma${SOFT_HYPHEN}nian`,
    );
    expect(withLabelBreakPoints('Bartholomew')).toBe(
      `Bartho${SOFT_HYPHEN}lo${SOFT_HYPHEN}mew`,
    );
  });

  it('leaves short words, existing soft hyphens and other scripts alone', () => {
    expect(withLabelBreakPoints('Ash')).toBe('Ash');
    expect(withLabelBreakPoints('Maria')).toBe('Maria');
    expect(withLabelBreakPoints('Paternal')).toBe('Paternal');
    expect(withLabelBreakPoints('Mohammad')).toBe('Mohammad');
    expect(withLabelBreakPoints('佐藤アレクサンドラ美咲')).toBe(
      '佐藤アレクサンドラ美咲',
    );
    expect(withLabelBreakPoints('bio­logical')).toBe(
      withLabelBreakPoints('bio­logical'),
    );
  });
});
