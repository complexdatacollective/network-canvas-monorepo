import { describe, expect, it } from 'vitest';

import { checkScreenReaderText } from '@codaco/app-i18n/catalog-guards';

import { packageSource, sourceFiles } from './packageSource.ts';

/**
 * Text only a screen reader reads stays English in every language, written in
 * the component rather than as a message (`@codaco/app-i18n`'s README, "Text
 * only a screen reader reads is not a message").
 */

/** Attributes whose text a sighted person also sees, so it is translated. */
const SHOWN_AS_WELL: Record<string, string> = {};

describe('text only a screen reader reads', () => {
  it('is looking at enough of the package to be worth trusting', () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it('is never a translated message', () => {
    expect(
      checkScreenReaderText(sourceFiles(), packageSource, SHOWN_AS_WELL),
    ).toEqual([]);
  });
});
