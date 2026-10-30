import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  collectSourceFiles,
  extractMessages,
  type ExtractedCatalog,
} from '@codaco/app-i18n/catalog-guards';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as ExtractedCatalog;

// The interview's built-in messages are English only: what the interview
// shows comes from the protocol, and what stays built in is text only screen
// readers read. `en.json` records them, with their descriptions, for whoever
// localises them.
describe('the interview package built-in messages', () => {
  it('keeps the English extraction fresh, with unique explicit IDs and translator descriptions', async () => {
    const extracted = await extractMessages(
      collectSourceFiles(dirname(localesDir)),
    );
    expect(checkCatalogFreshness(committedEn, extracted)).toEqual([]);
  }, 120_000);

  it('owns only interview.* messages and leaves universal verbs to common.*', () => {
    expect(Object.keys(committedEn).length).toBeGreaterThan(0);
    for (const id of Object.keys(committedEn)) {
      expect(id).toMatch(/^interview\./);
    }
  });
});
