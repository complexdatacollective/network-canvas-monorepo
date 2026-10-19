import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { LegacyArchitectPin } from '../legacy-architect.ts';

export const FIXTURE_VERSION = '8.5.0';

export const fixturePin = (sha256 = 'a'.repeat(64)): LegacyArchitectPin => ({
  version: FIXTURE_VERSION,
  url: `https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2Farchitect%40${FIXTURE_VERSION}/architect-v8-dist.tgz`,
  sha256,
  cachePrefix: 'architect-v8-',
});

/**
 * The files of a sub-path Architect 8 build in the layout the 8.x release lane
 * packs (the dist root plus dist-info.json), small enough to write in a test.
 * Override a file's content, or pass null to leave it out.
 */
export const legacyDistFiles = (
  overrides: Record<string, string | null> = {},
): Record<string, string | null> => ({
  'index.html':
    '<!doctype html><script type="module" src="/v8/assets/main-abc.js"></script>',
  'preview/index.html':
    '<!doctype html><script type="module" src="/v8/assets/preview-abc.js"></script>',
  'assets/main-abc.js': 'console.log("architect 8");',
  'assets/preview-abc.js': 'console.log("architect 8 preview");',
  'sw.js': `self.workbox.core.setCacheNameDetails({prefix:"architect-v8-${FIXTURE_VERSION}-turbo-0123456789abcdef"});`,
  'manifest.webmanifest': JSON.stringify({
    name: 'Architect 8',
    start_url: '/v8/',
    scope: '/v8/',
  }),
  'dist-info.json': JSON.stringify({
    tag: `@codaco/architect@${FIXTURE_VERSION}`,
    version: FIXTURE_VERSION,
    commit: '0123456789abcdef0123456789abcdef01234567',
    base: '/v8/',
    cachePrefix: 'architect-v8-',
  }),
  ...overrides,
});

export const writeFiles = (
  directory: string,
  files: Record<string, string | null>,
): void => {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
};

/** Pack `directory` as the release lane does; returns the tarball's sha256. */
export const packTarball = (
  directory: string,
  out: string,
  extraTarArgs: string[] = [],
): string => {
  const packed = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; dir="$1"; out="$2"; shift 2; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner "$@" -C "$dir" -cf - . | gzip -n > "$out"',
      'pack',
      directory,
      out,
      ...extraTarArgs,
    ],
    { encoding: 'utf8' },
  );
  if (packed.status !== 0) throw new Error(packed.stderr);
  return createHash('sha256').update(readFileSync(out)).digest('hex');
};
