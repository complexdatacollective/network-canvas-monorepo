// oxlint-tailwindcss caches each design system on disk, and the canonical
// form it computed for every class, under a key built from the entry CSS, the
// CSS it imports, and the text of each `@plugin` file. It does not read the
// modules a `@plugin` file imports. Ours are one-line re-exports
// (`elevation/index.ts` re-exports `elevation.ts`, which imports
// `scopedColor.ts`), so an edit to a plugin left every checkout on the machine
// linting against the old design system: #2467 changed what `bg-*` emits, and
// local runs kept calling `bg-[length:…]` canonical while CI, starting from an
// empty cache, did not.
//
// Naming the cache directory after the content of everything under
// `tooling/tailwind` means any edit there starts a fresh cache. This module is
// imported for its side effect, before the plugin, because the plugin reads
// the variable once, when it loads.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const tailwindTooling = fileURLToPath(new URL('../tailwind/', import.meta.url));

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== 'node_modules')
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    });
}

if (!process.env.OXLINT_TAILWINDCSS_CACHE_DIR) {
  const hash = createHash('md5');
  for (const file of filesUnder(tailwindTooling).toSorted()) {
    hash.update(relative(tailwindTooling, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  // The plugin's own default is `oxlint-tailwindcss-<uid>` in the temp
  // directory, which it creates readable only by its owner; this keeps that
  // shape and adds the content hash.
  process.env.OXLINT_TAILWINDCSS_CACHE_DIR = join(
    tmpdir(),
    `oxlint-tailwindcss-${userInfo().uid}-${hash.digest('hex').slice(0, 12)}`,
  );
}
