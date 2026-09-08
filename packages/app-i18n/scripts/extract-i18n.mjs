// Regenerates src/locales/en.json from the package's own defineMessages
// calls. The freshness guard in src/__tests__ runs the same extraction and
// fails CI when this artifact is stale.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectSourceFiles, extractMessages } from '../src/catalog-guards.ts';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = await extractMessages(
  collectSourceFiles(join(packageDir, 'src')),
);
writeFileSync(
  join(packageDir, 'src/locales/en.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
