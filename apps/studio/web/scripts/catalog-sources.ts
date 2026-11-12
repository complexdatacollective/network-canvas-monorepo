// The source files Studio's client catalogue is extracted from: the client's
// own, and the API's. The API never formats a message, but its resource host
// refuses with encoded ones (`@codaco/app-i18n/message-errors`) that this
// client formats, so their English belongs in the catalogue translators work
// from. Shared by `extract-i18n.mjs` and the freshness guard in
// src/locales/__tests__, so the two cannot read different trees.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectSourceFiles } from '@codaco/app-i18n/catalog-guards';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

export function studioCatalogSourceFiles(): string[] {
  return [
    ...collectSourceFiles(join(packageDir, 'src')),
    ...collectSourceFiles(join(packageDir, '../api/src')),
  ];
}
