import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import JSZip from 'jszip';

/**
 * Bundles the schema-8 `@codaco/sample-protocol` package (the same protocol
 * Architect ships as its built-in template) into a downloadable
 * `.netcanvas` file in `public/protocols/`.
 *
 * Run at build time (prebuild) so the download offered in the schema-8 tutorials
 * always matches the protocol bundled in Architect — no hand-maintained copy
 * to drift. The output file is gitignored.
 */

// The package's main export ('.') is protocol.json; its directory is the package root.
const require = createRequire(import.meta.url);
const protocolJsonPath = require.resolve('@codaco/sample-protocol');
const packageDir = dirname(protocolJsonPath);
const assetsDir = join(packageDir, 'assets');

const OUTPUT_PATH = join(
  process.cwd(),
  'public',
  'protocols',
  'Sample Protocol v5.netcanvas',
);

async function generate() {
  const protocolJson = readFileSync(protocolJsonPath, 'utf8');

  // Use the protocol's own lastModified so the zip is reproducible across builds.
  const { lastModified } = JSON.parse(protocolJson) as {
    lastModified?: string;
  };
  const date = lastModified ? new Date(lastModified) : new Date(0);

  const zip = new JSZip();
  zip.file('protocol.json', protocolJson, { date });

  const assetsFolder = zip.folder('assets');
  if (!assetsFolder) {
    throw new Error('Failed to create assets folder in archive.');
  }

  if (!existsSync(assetsDir)) {
    throw new Error(
      `Assets directory not found at ${assetsDir}. Is @codaco/sample-protocol installed and built?`,
    );
  }

  for (const fileName of readdirSync(assetsDir)) {
    assetsFolder.file(fileName, readFileSync(join(assetsDir, fileName)), {
      date,
    });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  writeFileSync(OUTPUT_PATH, buffer);
  console.log(
    `Wrote ${OUTPUT_PATH} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
  );
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
