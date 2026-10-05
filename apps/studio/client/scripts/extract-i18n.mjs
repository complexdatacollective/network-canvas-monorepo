// Regenerates src/locales/en.json from the client's own defineMessages
// calls. The freshness guard in src/locales/__tests__ runs the same
// extraction and fails CI when this artifact is stale. Imported common.*
// descriptors are declared in @codaco/app-i18n, not here, so extraction —
// which only sees this workspace's source — never re-collects them.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectSourceFiles,
  extractMessages,
} from '@codaco/app-i18n/catalog-guards';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = await extractMessages(
  collectSourceFiles(join(packageDir, 'src')),
);
writeFileSync(
  join(packageDir, 'src/locales/en.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
