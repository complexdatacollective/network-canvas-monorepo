#!/usr/bin/env node
// Builds the protocol fixtures the script-driven lanes import.
//
// A .netcanvas is a zip with `protocol.json` at its root and the media beside
// it, so every fixture here is assembled rather than committed: the healthy one
// so it always carries the protocol source that is checked in, and the damaged
// ones because a repository is the wrong place to keep a deliberately corrupt
// archive and an entry that inflates to more than a gigabyte.
//
// Usage: node make-fixtures.mjs [--out <dir>]
// Prints one JSON line naming every file it wrote.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeflateRaw, crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const require = createRequire(join(repoRoot, 'package.json'));
/** @type {typeof import('jszip')} */
const JSZip = require('jszip');

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const outDir = argument('out', join(here, '..', 'artifacts', 'fixtures'));
mkdirSync(outDir, { recursive: true });

const protocolDir = join(
  repoRoot,
  'packages/protocols/e2e/fresco-release-test',
);
const protocol = JSON.parse(
  readFileSync(join(protocolDir, 'protocol.json'), 'utf8'),
);
const videoSource = protocol.assetManifest['release-test-video'].source;
const videoBytes = readFileSync(
  join(repoRoot, 'packages/protocols/development/assets', videoSource),
);

const write = async (name, zip) => {
  const path = join(outDir, name);
  writeFileSync(path, await zip.generateAsync({ type: 'nodebuffer' }));
  return path;
};

const archiveOf = (document, { withMedia }) => {
  const zip = new JSZip();
  zip.file('protocol.json', JSON.stringify(document, null, 2));
  // Media lives under `assets/` in a .netcanvas: that is where the reader
  // resolves a manifest entry's `source`, so a file at the archive root is a
  // missing resource, not a present one.
  if (withMedia) zip.file(`assets/${videoSource}`, videoBytes);
  return zip;
};

const written = {};

// The healthy protocol the interview lane conducts.
written.healthy = await write(
  'fresco-release-test.netcanvas',
  archiveOf(protocol, { withMedia: true }),
);

// A protocol whose manifest names a file the archive does not contain. Fresco
// refuses it — a resource that never loads would surface to a participant
// mid-interview — and the refusal names the resource the way the researcher
// named it rather than by its internal filename, which is why the manifest
// entry's display name here is deliberately not the file's own.
written.missingAsset = await write(
  'missing-asset.netcanvas',
  archiveOf(
    // Distinct from the healthy protocol in its STAGES, because the duplicate
    // check runs before the media is read and hashes the codebook and stages
    // — a copy that differed only by name would be refused as a duplicate and
    // the missing resource never reached. The extra stage is inert; what the
    // refusal is about is still the missing file.
    {
      ...protocol,
      name: `${protocol.name} (missing resource)`,
      stages: [
        ...protocol.stages,
        {
          id: 'stage-missing-asset-marker',
          type: 'Information',
          label: 'Distinguishes this fixture from the healthy one',
          title: 'Distinguishes this fixture from the healthy one',
          items: [
            {
              id: 'marker',
              type: 'text',
              content:
                'This copy exists only to be refused for its missing resource.',
            },
          ],
        },
      ],
    },
    { withMedia: false },
  ),
);

// A damaged archive: a well-formed zip with its tail cut off, so the central
// directory it points at is not there. Described as damaged rather than as
// "could not be opened".
{
  const healthy = readFileSync(written.healthy);
  const truncated = healthy.subarray(0, Math.floor(healthy.length * 0.6));
  const path = join(outDir, 'damaged-archive.netcanvas');
  writeFileSync(path, truncated);
  written.damagedArchive = path;
}

// A discriminating pair, both derived from the protocol that is known to
// import. A comparison value may now be a fraction, because a scalar attribute
// records a normalised 0-1 reading and an integer-only value could express no
// comparison across it — but the operators that COUNT SELECTED OPTIONS still
// take a whole number, and now say so. Testing only the refusal would prove
// nothing: a file refused for some other reason looks identical.
const filtered = (rule) => {
  const document = structuredClone(protocol);
  document.stages.find((entry) => entry.id === 'stage-socio').filter = {
    rules: [{ id: 'rule-filter', type: 'node', options: rule }],
  };
  return document;
};
written.fractionalValue = await write(
  'fractional-value-filter.netcanvas',
  archiveOf(
    filtered({
      type: 'person',
      attribute: 'hours',
      operator: 'LESS_THAN',
      value: 2.5,
    }),
    { withMedia: true },
  ),
);
written.fractionalCount = await write(
  'fractional-count-filter.netcanvas',
  archiveOf(
    filtered({
      type: 'person',
      attribute: 'context',
      operator: 'OPTIONS_GREATER_THAN',
      value: 1.5,
    }),
    { withMedia: true },
  ),
);

// The compression bomb: one entry that inflates past the shared limit.
//
// Sized from the limit the shipped reader enforces, read out of its own source
// rather than restated here — a fixture that stopped exceeding the limit would
// otherwise import cleanly and the check would pass while proving nothing.
{
  const source = readFileSync(
    join(repoRoot, 'packages/protocol-validation/src/utils/extractProtocol.ts'),
    'utf8',
  );
  const limit = /MAX_INFLATED_BYTES = (\d+) \* MB/.exec(source);
  if (!limit)
    throw new Error(
      'could not read MAX_INFLATED_BYTES from extractProtocol.ts — the bomb would be sized against a guess',
    );
  written.inflationBomb = await writeInflationBomb(
    join(outDir, 'inflation-bomb.netcanvas'),
    Number(limit[1]) * 1024 * 1024,
  );
}

process.stdout.write(`${JSON.stringify({ ok: true, ...written })}\n`);

/**
 * A single-entry zip whose `protocol.json` inflates to more than `limit`.
 *
 * The entry is named `protocol.json` on purpose: it is the first thing the
 * reader inflates, so the limit is reached on the path every import takes
 * rather than on an optional one. The payload is deflated through a stream, so
 * building a gigabyte-and-a-bit costs a megabyte of output and no more memory
 * than one block at a time — the cost falls where it belongs, on an importer
 * that tries to inflate it.
 */
async function writeInflationBomb(path, limit) {
  const BLOCK = 1024 * 1024;
  const block = Buffer.alloc(BLOCK); // zeros deflate to almost nothing
  // Comfortably past the limit, so a reader that checks after a chunk rather
  // than before it still stops.
  const blocks = Math.ceil(limit / BLOCK) + 8;
  const uncompressedSize = blocks * BLOCK;

  const deflate = createDeflateRaw();
  const chunks = [];
  deflate.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    deflate.on('end', resolve);
    deflate.on('error', reject);
  });

  let checksum = 0;
  for (let index = 0; index < blocks; index += 1) {
    checksum = crc32(block, checksum);
    if (!deflate.write(block))
      await new Promise((resolve) => deflate.once('drain', resolve));
  }
  deflate.end();
  await finished;

  writeFileSync(
    path,
    zipOf('protocol.json', Buffer.concat(chunks), uncompressedSize, checksum),
  );
  return path;
}

/** A minimal single-entry zip container around already-deflated data. */
function zipOf(name, compressed, uncompressedSize, checksum) {
  const nameBytes = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0x21, 12); // date (1980-01-01)
  local.writeUInt32LE(checksum >>> 0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(uncompressedSize >>> 0, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(checksum >>> 0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(uncompressedSize >>> 0, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42); // local header offset

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + compressed.length, 16);

  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, end]);
}
