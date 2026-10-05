import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectSourceFiles,
  extractMessages,
} from '@codaco/app-i18n/catalog-guards';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDirectories = [
  'actions',
  'app',
  'components',
  'hooks',
  'i18n',
  'schemas',
  'utils',
];
const files = sourceDirectories.flatMap((directory) =>
  collectSourceFiles(join(root, directory)),
);
const catalog = await extractMessages(files);
writeFileSync(
  join(root, 'src/locales/en.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
