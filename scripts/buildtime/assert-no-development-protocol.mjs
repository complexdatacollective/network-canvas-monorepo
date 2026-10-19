// Production-build assertion shared by Architect and Interviewer: neither may
// ship the Development protocol (packages/protocols/development), which both
// offer only in `vite dev`. Its media is matched by content, so a renamed or
// re-hashed copy is still caught — as an emitted file (SHA-256 of the bytes)
// or inlined into a text file as base64 or a URL-encoded SVG (a slice from the
// middle of the file, so a shared file-format header cannot match). The protocol itself is matched
// by every long, escape-free string it contains that no protocol the apps do
// ship (the Sample protocol and the templates) also contains: a file holding
// most of those strings holds the protocol.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const protocolsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'protocols',
);

// Text files a bundler can inline an asset or a protocol into.
const TEXT_FILE = /\.(?:js|mjs|cjs|css|html|json|webmanifest|txt|svg)$/;
// Long enough to be specific to the protocol, and made only of characters no
// JSON or JS string encoding escapes, so the text appears verbatim in a chunk.
const MARKER_MIN_LENGTH = 40;
const MARKER_CHARS = /^[A-Za-z0-9 ,.()?:;-]+$/;
// The app may share a sentence or two with the protocol (the interview runtime
// carries some of the same localized messages), so a file is reported only when
// it holds most of the markers, as any copy of the protocol does.
const MIN_MARKERS = 5;
// Bytes of each asset turned into a base64 needle (a multiple of 3, so the
// slice encodes to the same characters it has inside the whole file's base64).
const NEEDLE_BYTES = 48;

// Vite inlines a small SVG as a URL-encoded `data:image/svg+xml,` URL rather
// than as base64; this is that encoding (vite/src/node/plugins/asset.ts).
const viteSvgDataText = (text) =>
  text
    .trim()
    .replaceAll(/>\s+</g, '><')
    .replaceAll('"', "'")
    .replaceAll('%', '%25')
    .replaceAll('#', '%23')
    .replaceAll('<', '%3c')
    .replaceAll('>', '%3e')
    .replaceAll(/\s+/g, '%20');

const middleSlice = (text, length) => {
  const start = Math.floor(Math.max(0, text.length - length) / 2);
  return text.slice(start, start + length);
};

const listFiles = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));

const collectStrings = (value, out) => {
  if (typeof value === 'string') {
    out.add(value);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectStrings(child, out);
  }
  return out;
};

const shippedProtocolText = (root) =>
  ['sample', 'templates']
    .flatMap((dir) => listFiles(path.join(root, dir)))
    .filter((file) => file.endsWith('protocol.json'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

/**
 * The strings that identify the Development protocol's JSON in a build. Throws
 * when there are none, so the check cannot silently stop checking.
 */
export const developmentProtocolMarkers = (root = protocolsRoot) => {
  const protocol = JSON.parse(
    readFileSync(path.join(root, 'development', 'protocol.json'), 'utf8'),
  );
  const shipped = shippedProtocolText(root);
  const markers = [...collectStrings(protocol, new Set())].filter(
    (text) =>
      text.length >= MARKER_MIN_LENGTH &&
      MARKER_CHARS.test(text) &&
      !shipped.includes(text),
  );
  if (markers.length < MIN_MARKERS) {
    throw new Error(
      `the Development protocol has ${markers.length} string(s) of ${MARKER_MIN_LENGTH}+ plain characters to recognise it by, fewer than ${MIN_MARKERS}; update the marker rule in scripts/buildtime/assert-no-development-protocol.mjs`,
    );
  }
  return markers;
};

/** Content fingerprints of each Development protocol asset. */
const developmentAssetFingerprints = (root = protocolsRoot) => {
  const assetsDir = path.join(root, 'development', 'assets');
  const assets = listFiles(assetsDir)
    .filter((file) => !path.basename(file).startsWith('.'))
    .map((file) => {
      const bytes = readFileSync(file);
      const middle =
        Math.floor(Math.max(0, bytes.length - NEEDLE_BYTES) / 2 / 3) * 3;
      const needles = [
        bytes.subarray(middle, middle + NEEDLE_BYTES).toString('base64'),
      ];
      if (file.endsWith('.svg')) {
        needles.push(
          middleSlice(viteSvgDataText(bytes.toString('utf8')), NEEDLE_BYTES),
        );
      }
      return {
        name: path.relative(assetsDir, file),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        needles,
      };
    });
  if (assets.length === 0) {
    throw new Error(`no Development protocol assets found in ${assetsDir}`);
  }
  return assets;
};

/**
 * Every place the Development protocol appears in a build output directory,
 * as human-readable findings (empty when the build is clean).
 */
export const findDevelopmentProtocol = (dist, root = protocolsRoot) => {
  const markers = developmentProtocolMarkers(root);
  const assets = developmentAssetFingerprints(root);
  const bySha = new Map(assets.map((asset) => [asset.sha256, asset.name]));
  const findings = [];

  for (const file of listFiles(dist)) {
    const relative = path.relative(dist, file);
    const bytes = readFileSync(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const copied = bySha.get(sha256);
    if (copied) {
      findings.push(`${relative} is a copy of development/assets/${copied}`);
      continue;
    }
    if (!TEXT_FILE.test(file) || statSync(file).size === 0) continue;
    const text = bytes.toString('utf8');
    for (const asset of assets) {
      if (asset.needles.some((needle) => text.includes(needle))) {
        findings.push(`${relative} inlines development/assets/${asset.name}`);
      }
    }
    const found = markers.filter((candidate) => text.includes(candidate));
    if (found.length > markers.length / 2) {
      findings.push(
        `${relative} contains the Development protocol's JSON (${found.length} of its ${markers.length} marker strings, e.g. "${found[0]}")`,
      );
    }
  }
  return findings;
};

/** Throws when a production build contains any of the Development protocol. */
export const assertNoDevelopmentProtocol = (dist, root = protocolsRoot) => {
  const findings = findDevelopmentProtocol(dist, root);
  if (findings.length > 0) {
    throw new Error(
      `the Development protocol is dev-only, but this production build ships it:\n  ${findings.join('\n  ')}`,
    );
  }
};
