import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectSourceFiles,
  extractMessages,
} from '@codaco/app-i18n/catalog-guards';
import { SUPPLIED_TEXTS } from '@codaco/protocol-validation';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = await extractMessages(
  collectSourceFiles(join(packageDir, 'src')),
);
writeFileSync(
  join(packageDir, 'src/locales/en.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);

// The English of the wording a protocol may reword is also a catalogue of its
// own, beside the translations of that wording, because it is read while an
// interview runs. `en.json` above is extraction data: it carries a
// description for each message, and a build that follows
// `@codaco/app-i18n`'s convention treats every file directly inside
// `src/locales` as its own (see `src/wording/suppliedWording.ts`).
const wordingIds = [
  ...new Set(SUPPLIED_TEXTS.map(({ wording }) => wording)),
].toSorted();
const unworded = wordingIds.filter((id) => catalog[id] === undefined);
if (unworded.length > 0) {
  throw new Error(
    `The schema names messages the interview does not declare: ${unworded.join(', ')}`,
  );
}
writeFileSync(
  join(packageDir, 'src/locales/wording/en.json'),
  `${JSON.stringify(
    Object.fromEntries(
      wordingIds.map((id) => [id, catalog[id].defaultMessage]),
    ),
    null,
    2,
  )}\n`,
);
