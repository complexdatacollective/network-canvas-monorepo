#!/usr/bin/env node
/**
 * Writes `turbo.ci.json`: the repository's `turbo.json` with `concurrency`
 * pinned to `1`, for CI to use via `TURBO_ROOT_TURBO_JSON`.
 *
 * Why a generated file rather than the real `turbo.json`. Turbo has no
 * environment variable for concurrency (checked in 2.10.4 and 2.11.6), and
 * `concurrency` in `turbo.json` would serialise every developer's machine too
 * — which is the opposite of what a 16-core laptop wants. A root config also
 * cannot `extends` another, so the only way to vary one key between CI and a
 * local checkout is to hand turbo a different root config, which
 * `TURBO_ROOT_TURBO_JSON` does.
 *
 * Why textual insertion rather than parse-and-serialise. `turbo.json` is JSONC
 * — it carries a few hundred lines of comments explaining the task graph, and
 * they are the most valuable thing in the file. Re-serialising would delete
 * every one. Inserting the key after the opening brace leaves the rest of the
 * file byte-for-byte identical, so the generated config stays diffable against
 * its source.
 *
 * Setting `concurrency` does not change any task hash — turbo treats it as an
 * execution option, not a cache input — so CI and local runs share cache
 * entries exactly as before.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONCURRENCY = '1';

export function withPinnedConcurrency(source, concurrency = CONCURRENCY) {
  if (/^\s*\{\s*(?:\/\/[^\n]*\n\s*)*"concurrency"\s*:/.test(source)) {
    throw new Error(
      'turbo.json already sets `concurrency` at the top level. Remove it, or ' +
        'stop generating turbo.ci.json — two sources for one key will drift.',
    );
  }

  const opening = /^(﻿?\s*\{[^\S\n]*\n)/.exec(source);
  if (!opening) {
    throw new Error(
      'turbo.json does not start with an opening brace on its own line, so ' +
        'the concurrency key cannot be inserted without reformatting it.',
    );
  }

  return `${opening[1]}  "concurrency": "${concurrency}",\n${source.slice(opening[1].length)}`;
}

export function writeTurboCiConfig(root) {
  const source = readFileSync(join(root, 'turbo.json'), 'utf8');
  const target = join(root, 'turbo.ci.json');
  writeFileSync(target, withPinnedConcurrency(source));
  return target;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const target = writeTurboCiConfig(root);
  process.stdout.write(`${target}\n`);
}
