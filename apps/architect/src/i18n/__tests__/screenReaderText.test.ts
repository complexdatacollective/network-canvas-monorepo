import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkScreenReaderText,
  collectSourceFiles,
} from '@codaco/app-i18n/catalog-guards';

/**
 * Text only a screen reader reads stays English in every language, written in
 * the component rather than as a message (`@codaco/app-i18n`'s README, "Text
 * only a screen reader reads is not a message").
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Attributes whose text a sighted person also sees, so it is translated. */
const SHOWN_AS_WELL: Record<string, string> = {};

describe('text only a screen reader reads', () => {
  it('is looking at enough of Architect to be worth trusting', () => {
    expect(collectSourceFiles(srcDir).length).toBeGreaterThan(100);
  });

  it('is never a translated message', () => {
    expect(
      checkScreenReaderText(collectSourceFiles(srcDir), srcDir, SHOWN_AS_WELL),
    ).toEqual([]);
  });
});
