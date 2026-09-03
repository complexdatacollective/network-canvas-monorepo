import { describe, expect, it } from 'vitest';

import { staggerSelector } from '../useStaggerAnimation';

describe('staggerSelector', () => {
  it('targets every item without a key', () => {
    expect(staggerSelector()).toBe('[data-stagger-item]');
  });

  it('scopes to the current key', () => {
    expect(staggerSelector('sort::asc')).toBe(
      '[data-stagger-item][data-stagger-key="sort::asc"]',
    );
    expect(staggerSelector(3)).toBe(
      '[data-stagger-item][data-stagger-key="3"]',
    );
  });

  it('escapes a key that carries selector metacharacters', () => {
    // A search query is a typical key; a quoted phrase must not end the
    // attribute value early and leave an invalid selector behind.
    const selector = staggerSelector('"network" \\ end');

    expect(selector).toBe(
      '[data-stagger-item][data-stagger-key="\\"network\\" \\\\ end"]',
    );
    expect(() => document.querySelectorAll(selector)).not.toThrow();
  });
});
