// Regenerates src/locales/en.json from the defineMessages calls in the
// client's own source and the API's (see catalog-sources.ts). The freshness
// guard in src/locales/__tests__ runs the same extraction and fails CI when
// this artifact is stale. Imported common.* descriptors are declared in
// @codaco/app-i18n, not here, so extraction never re-collects them.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractMessages } from '@codaco/app-i18n/catalog-guards';

import { studioCatalogSourceFiles } from './catalog-sources.ts';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = await extractMessages(studioCatalogSourceFiles());
writeFileSync(
  join(packageDir, 'src/locales/en.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
