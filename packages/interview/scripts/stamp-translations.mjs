// Records the English each committed translation was made from, into
// src/locales/wording/<tag>.source.json. Run it after re-translating, or after
// an English edit that did not change what a translation should say; the
// catalogue guard fails until every translated id carries a record matching
// today's English. Read the report it prints before committing.
//
// The translations are of the wording a protocol may reword, which sit one
// folder below the extracted English (see `src/wording/suppliedWording.ts`).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatStampReport,
  stampTranslationSources,
} from '@codaco/app-i18n/catalog-guards';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const locales = join(root, 'src/locales');
console.log(
  formatStampReport(
    stampTranslationSources(join(locales, 'wording'), join(locales, 'en.json')),
  ),
);
