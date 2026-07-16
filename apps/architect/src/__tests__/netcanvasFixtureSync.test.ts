import { readFileSync } from 'node:fs';
import path from 'node:path';

import { extractProtocol } from '@codaco/protocol-validation';
import { expect, it } from 'vitest';

// The committed archive is a zip of packages/protocols/e2e/all-interfaces and
// has silently drifted behind that source fixture twice (schema-tightening PRs
// update the JSON but not the binary), breaking the import e2e only at the
// release gates. Rebuild it whenever this fails:
//   cd packages/protocols/e2e/all-interfaces && \
//     zip -rX ../../../../apps/architect/e2e/fixtures/files/all-interfaces.netcanvas \
//     protocol.json assets
const ARCHIVE_PATH = path.resolve(
  import.meta.dirname,
  '../../e2e/fixtures/files/all-interfaces.netcanvas',
);
const SOURCE_DIR = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/all-interfaces',
);

it('committed all-interfaces.netcanvas embeds the current source fixture', async () => {
  // extractProtocol also throws when a manifest-referenced asset file is
  // missing from the archive, so asset drift fails here too.
  const { protocol } = await extractProtocol(readFileSync(ARCHIVE_PATH));
  const source: unknown = JSON.parse(
    readFileSync(path.join(SOURCE_DIR, 'protocol.json'), 'utf8'),
  );
  expect(protocol).toEqual(source);
});
