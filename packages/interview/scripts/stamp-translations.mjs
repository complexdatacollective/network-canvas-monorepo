// Records the English each committed translation was made from, into
// src/locales/wording/<tag>.source.json and src/locales/added/<tag>.source.json.
// Run it after re-translating, or after an English edit that did not change
// what a translation should say; the catalogue guard fails until every
// translated id carries a record matching today's English. Read the report it
// prints before committing.
//
// The translations are of the wording a protocol may reword
// (`src/wording/suppliedWording.ts`) and of the text corrections have added
// (`src/wording/addedTextIds.ts`), which each sit one folder below the
// extracted English.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatStampReport,
  stampTranslationSources,
} from '@codaco/app-i18n/catalog-guards';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const locales = join(root, 'src/locales');
for (const folder of ['wording', 'added']) {
  console.log(`${folder}:`);
  console.log(
    formatStampReport(
      stampTranslationSources(join(locales, folder), join(locales, 'en.json')),
    ),
  );
}
