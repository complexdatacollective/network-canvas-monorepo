import { describe, expect, it } from 'vitest';

import { getLocalizedPathname } from '../DocumentationLocaleSwitcher';

describe('getLocalizedPathname', () => {
  it('swaps the language of a documentation address', () => {
    expect(
      getLocalizedPathname('es', '/en/design-protocols/getting-started'),
    ).toBe('/es/design-protocols/getting-started');
    expect(getLocalizedPathname('en', '/es/')).toBe('/en/');
    expect(getLocalizedPathname('en', '/es')).toBe('/en');
  });

  it('puts the language in front of an address without one', () => {
    expect(getLocalizedPathname('es', '/collect-data/interviewer')).toBe(
      '/es/collect-data/interviewer',
    );
  });
});
