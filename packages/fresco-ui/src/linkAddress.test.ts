import { describe, expect, it } from 'vitest';

import { LINK_ADDRESS_PATTERN, linkAddress } from './linkAddress';

const LINKS = [
  'https://example.org',
  'http://example.org/a b',
  'HTTPS://EXAMPLE.ORG/Path',
  'https://example.org/?a=1&amp;b=2',
  'mailto:help@example.org',
  'tel:+15555550123',
];

const REFUSED = [
  'https:example.org',
  'http:/example.org',
  'https:\\\\example.org',
  '//example.org',
  '/protocol-gallery',
  '#anchor',
  'example.org',
  'javascript:alert(1)',
  'data:text/html,Hello',
  'file:///etc/passwd',
  'ftp://files.example.org',
  'https://exa\u0000mple.org',
  'https://',
  '',
];

describe('linkAddress', () => {
  it.each(LINKS)('keeps %j as it is written', (address) => {
    expect(linkAddress(` ${address} `)).toBe(address);
  });

  it.each(REFUSED)('refuses %j', (address) => {
    expect(linkAddress(address)).toBeUndefined();
  });

  // The editor's link field accepts what is drawn as a link, so a field
  // matching the pattern holds an address `linkAddress` keeps.
  it('gives the editor’s link field a pattern that agrees with it', () => {
    const pattern = new RegExp(`^(?:${LINK_ADDRESS_PATTERN})$`);
    for (const address of LINKS) expect(pattern.test(address)).toBe(true);
    for (const address of REFUSED.slice(0, 11)) {
      expect(pattern.test(address), address).toBe(false);
    }
  });
});
