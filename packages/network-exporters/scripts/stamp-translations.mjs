// Records the English each committed translation was made from, into
// src/locales/<tag>.source.json. Run it after re-translating, or after an
// English edit that did not change what a translation should say; the catalog
// guard fails until every translated id carries a record matching today's
// English. Read the report it prints before committing.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatStampReport,
  stampTranslationSources,
} from '@codaco/app-i18n/catalog-guards';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
console.log(
  formatStampReport(stampTranslationSources(join(root, 'src/locales'))),
);
