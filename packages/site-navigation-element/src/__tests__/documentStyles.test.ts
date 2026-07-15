import { beforeEach, describe, expect, it } from 'vitest';

import { ensureDocumentStyles } from '../documentStyles';

describe('ensureDocumentStyles', () => {
  beforeEach(() => {
    document
      .querySelectorAll('style[data-nc-site-navigation]')
      .forEach((tag) => tag.remove());
  });

  it('appends a single document-level style tag, idempotently', () => {
    ensureDocumentStyles();
    ensureDocumentStyles();

    const tags = document.querySelectorAll('style[data-nc-site-navigation]');
    expect(tags).toHaveLength(1);
  });

  it('registers the fonts and property rules at document level', () => {
    ensureDocumentStyles();

    const css =
      document.querySelector('style[data-nc-site-navigation]')?.textContent ??
      '';
    expect(css).toContain("font-family: 'Nunito Variable'");
    expect(css).toContain("font-family: 'Inclusive Sans Variable'");
    expect(css).toContain('@property');
    expect(css).not.toContain('__NC_FONT_BASE__');
    expect(css).toContain('/fonts/nunito-latin-wght-normal.woff2');
  });
});
