import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IdentityMark } from './IdentityMark';

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

/**
 * The artwork a seed produces, as markup.
 *
 * `Pattern` generates its shapes from the seed, so the rendered SVG IS the
 * derivation — comparing it is how a test can tell that two marks got the
 * same artwork without reaching into the generator's internals or reading
 * the same tables the component reads.
 */
function artworkOf(id: string, name = 'Example Entity'): string {
  const svg = markFor(id, name).querySelector('svg');
  if (svg === null) {
    throw new Error(`IdentityMark for "${id}" rendered no pattern`);
  }
  // `useId` puts a render-scoped value in the gradient's id and its
  // reference, which changes between renders and says nothing about the
  // seed. Everything else — the variant's shapes and the palette — is the
  // seed's own.
  return svg.innerHTML.replaceAll(/pat-bg[^"]*/g, 'gradient');
}

describe('IdentityMark artwork', () => {
  it('gives the same id the same artwork every time', () => {
    const id = 'org_01JQ2W3T4Y5Z6A7B8C9D0EFGHJ';
    const first = artworkOf(id);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(artworkOf(id)).toBe(first);
    }
  });

  it('derives the artwork from the id alone, so a rename never changes it', () => {
    const id = 'team_sonic';

    expect(artworkOf(id, 'Something Else Entirely')).toBe(
      artworkOf(id, 'SONIC Lab'),
    );
  });

  it('tells entities apart, rather than collapsing onto one pattern', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `team_${index}`);
    const distinct = new Set(ids.map((id) => artworkOf(id)));

    // Not 200 — two seeds may land on the same variant and base, and the
    // point is only that the mark is not effectively constant. The real
    // guarantee is stability per id, above.
    expect(distinct.size).toBeGreaterThan(100);
  });

  it('renders a plain surface rather than a broken tile for an entity with no id', () => {
    const mark = markFor('', 'Not Saved Yet');

    expect(mark.querySelector('svg')).toBeNull();
    expect(mark.textContent).toBe('NY');
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
