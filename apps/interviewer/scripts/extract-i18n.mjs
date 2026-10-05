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
