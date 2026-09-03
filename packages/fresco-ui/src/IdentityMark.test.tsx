import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IdentityMark } from './IdentityMark';

/**
 * The six fills the hash can land on. Asserted against literally rather than
 * imported: a test that reads the same table the component reads cannot
 * notice the table changing, and the point of these tests is that an
 * entity's colour is fixed for the life of its id.
 */
const FILLS = [
  'bg-neon-coral',
  'bg-mustard',
  'bg-sea-green',
  'bg-sea-serpent',
  'bg-purple-pizazz',
  'bg-cyber-grape',
];

function markFor(id: string, name = 'Example Entity'): HTMLElement {
  const { container, unmount } = render(<IdentityMark id={id} name={name} />);
  const mark = container.firstElementChild;
  if (!(mark instanceof HTMLElement)) {
    throw new Error('IdentityMark rendered no element');
  }
  // Detach the tree but keep the element, so repeated renders in one test do
  // not stack up and `container.firstElementChild` stays unambiguous.
  const clone = mark.cloneNode(true) as HTMLElement;
  unmount();
  return clone;
}

function fillOf(id: string): string {
  const classes = [...markFor(id).classList];
  const fill = classes.find((className) => className.startsWith('bg-'));
  if (fill === undefined) {
    throw new Error(
      `IdentityMark for "${id}" rendered no fill: ${classes.join(' ')}`,
    );
  }
  return fill;
}

describe('IdentityMark colour', () => {
  it('gives the same id the same fill every time', () => {
    const id = 'org_01JQ2W3T4Y5Z6A7B8C9D0EFGHJ';
    const first = fillOf(id);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(fillOf(id)).toBe(first);
    }
  });

  it('derives the fill from the id alone, so a rename never recolours', () => {
    const id = 'team_sonic';
    const before = [...markFor(id, 'SONIC Lab').classList];
    const after = [...markFor(id, 'Something Else Entirely').classList];

    expect(after).toEqual(before);
  });

  it('gives different ids different fills, and only ever palette fills', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `team_${index}`);
    const used = new Set(ids.map(fillOf));

    // Every fill it picks is one of the six.
    for (const fill of used) expect(FILLS).toContain(fill);
    // And over 200 ids it reaches all six, rather than collapsing onto one.
    expect(used.size).toBe(FILLS.length);
  });

  it('pairs the three light fills with the dark foreground', () => {
    // The pairing is measured, not stylistic: white on mustard is 1.82:1, on
    // sea green 2.27:1 and on sea serpent 2.23:1, all below the 3:1 floor.
    const darkForeground = new Set([
      'bg-mustard',
      'bg-sea-green',
      'bg-sea-serpent',
    ]);

    for (let index = 0; index < 200; index += 1) {
      const id = `entity_${index}`;
      const classes = [...markFor(id).classList];
      const fill = classes.find((className) => className.startsWith('bg-'));
      const expected = darkForeground.has(fill ?? '')
        ? 'text-charcoal'
        : 'text-white';
      expect(classes).toContain(expected);
    }
  });
});

describe('IdentityMark monogram', () => {
  const monogram = (name: string) =>
    markFor('constant-id', name).textContent ?? '';

  it('takes the first letter of the first and last word', () => {
    expect(monogram('SONIC Lab')).toBe('SL');
    expect(monogram('Complex Data Collective')).toBe('CC');
  });

  it('takes the first two letters of a single word', () => {
    expect(monogram('Sociogram')).toBe('SO');
  });

  it('uppercases', () => {
    expect(monogram('sonic lab')).toBe('SL');
    expect(monogram('sociogram')).toBe('SO');
  });

  it('ignores non-alphanumerics rather than making them the monogram', () => {
    expect(monogram('  the   SONIC   lab  ')).toBe('TL');
    expect(monogram('Bo & Co.')).toBe('BC');
    expect(monogram('@network/canvas')).toBe('NC');
    expect(monogram('🙂 Happy Team 🙂')).toBe('HT');
  });

  it('treats digits as usable', () => {
    expect(monogram('2024 Cohort')).toBe('2C');
    expect(monogram('42')).toBe('42');
  });

  it('falls back rather than crashing when nothing is usable', () => {
    expect(monogram('')).toBe('?');
    expect(monogram('   ')).toBe('?');
    expect(monogram('•••')).toBe('?');
    expect(monogram('🙂')).toBe('?');
  });

  it('takes whole characters outside the BMP', () => {
    // Two astral characters, so a code-unit split would return half of the
    // first one and render a lone surrogate.
    expect(monogram('𝒜𝒷')).toBe('𝒜𝒷');
  });
});

describe('IdentityMark accessibility', () => {
  it('is hidden from assistive technology, never the entity name', () => {
    const { container } = render(<IdentityMark id="team_1" name="SONIC Lab" />);
    const mark = container.firstElementChild;

    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).not.toHaveAttribute('aria-label');
    expect(mark).not.toHaveAttribute('title');
    expect(mark).not.toHaveAttribute('role');
  });
});
