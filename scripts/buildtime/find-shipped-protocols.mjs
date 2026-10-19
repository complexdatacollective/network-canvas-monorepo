// Build-output check shared by the apps' PWA build assertions: which of the
// given bundled protocols (directories under packages/protocols, each with a
// protocol.json and optional assets/) reached a built dist, and how.
//
// A protocol's media is recognised by content, so a renamed or re-hashed copy
// still counts: an emitted file by its hash, and a file Vite inlined into a
// script by its base64 encoding (Vite's `?url` data URIs and `?arraybuffer`
// payloads both carry it). An inlined SVG is URL-encoded instead, so the
// protocol's source path is checked too: an `import.meta.glob` keys its
// result by that path. The protocol JSON is recognised by a long literal from
// it, which survives bundling verbatim.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// The longest string in the protocol that needs no escaping in any JS string
// form, so its bundled copy is byte-for-byte the same.
const protocolMarker = (protocol) => {
  const strings = [];
  const collect = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };
  collect(protocol);
  return strings
    .filter((value) => /^[\x20-\x7e]{40,}$/.test(value))
    .filter((value) => !/["'`\\]|\$\{/.test(value))
    .sort((a, b) => b.length - a.length)[0];
};

/**
 * @param {{ dist: string, protocolsRoot: string, protocolDirs: string[] }} options
 *   `protocolDirs` are paths relative to `protocolsRoot` (e.g. 'development').
 * @returns {Promise<string[]>} one line per shipped file, inlined media or
 *   protocol; empty when none of them reached the build.
 */
export const findShippedProtocols = async ({
  dist,
  protocolsRoot,
  protocolDirs,
}) => {
  const distFiles = (
    await readdir(dist, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const distHashes = new Map(
    distFiles.map((file) => [sha256(readFileSync(file)), file]),
  );
  const scripts = distFiles
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, text: readFileSync(file, 'latin1') }));
  const scriptsContaining = (needle) =>
    scripts
      .filter(({ text }) => text.includes(needle))
      .map(({ file }) => path.relative(dist, file));

  const found = [];
  for (const protocolDir of protocolDirs) {
    const dir = path.join(protocolsRoot, protocolDir);
    const assetsDir = path.join(dir, 'assets');
    for (const file of existsSync(assetsDir) ? await readdir(assetsDir) : []) {
      const data = readFileSync(path.join(assetsDir, file));
      // An empty file (a .gitkeep) has no content to recognise.
      if (data.length === 0) continue;
      const source = `${protocolDir}/assets/${file}`;
      const emitted = distHashes.get(sha256(data));
      if (emitted) found.push(`${path.relative(dist, emitted)} (${source})`);
      for (const script of scriptsContaining(data.toString('base64'))) {
        found.push(`${script} inlines ${source}`);
      }
    }
    for (const script of scriptsContaining(
      `packages/protocols/${protocolDir}/`,
    )) {
      found.push(`${script} references packages/protocols/${protocolDir}/`);
    }

    const marker = protocolMarker(
      JSON.parse(readFileSync(path.join(dir, 'protocol.json'), 'utf8')),
    );
    if (!marker) {
      throw new Error(
        `no literal to recognise ${protocolDir}/protocol.json by`,
      );
    }
    for (const script of scriptsContaining(marker)) {
      found.push(`${script} contains ${protocolDir}/protocol.json`);
    }
  }
  return found;
};
