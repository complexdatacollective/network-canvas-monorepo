import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { extractProtocol } from '@codaco/protocol-validation';

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
  // missing from the archive, so absent assets fail here too.
  const { protocol, assets } = await extractProtocol(
    readFileSync(ARCHIVE_PATH),
  );
  const source: unknown = JSON.parse(
    readFileSync(path.join(SOURCE_DIR, 'protocol.json'), 'utf8'),
  );
  expect(protocol).toEqual(source);

  // Missing assets throw above, but stale asset BYTES would not — compare each
  // file-backed asset against its source file. (The protocol equality above
  // makes the archive's manifest authoritative for the source manifest too;
  // apikey assets carry their value inside protocol.json.)
  for (const [assetId, definition] of Object.entries(
    protocol.assetManifest ?? {},
  )) {
    if (definition.type === 'apikey') continue;
    const extracted = assets.find((asset) => asset.id === assetId);
    expect(extracted, `asset ${assetId} missing from archive`).toBeDefined();
    if (!extracted || typeof extracted.data === 'string') continue;
    const archived = new Uint8Array(await extracted.data.arrayBuffer());
    const expected = Uint8Array.from(
      readFileSync(path.join(SOURCE_DIR, 'assets', definition.source)),
    );
    expect(
      archived,
      `asset ${definition.source} differs from the source fixture`,
    ).toEqual(expected);
  }
});
