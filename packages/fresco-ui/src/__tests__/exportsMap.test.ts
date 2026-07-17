// This suite intentionally reads only package.json and the scripts/ helper
// module — never fresco-ui's own src — so it stays safe to run in isolation
// even while sibling workspace packages (e.g. @codaco/shared-consts) are
// mid-edit and would otherwise break a normal import of fresco-ui source.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';

import {
  BUILD_GLOB_PATTERNS,
  deriveDistExports,
} from '../../scripts/exportsMap.mjs';

type ExportValue = string | { types: string; default: string };

type FrescoUiPackageJson = {
  // The src-pointing exports map only ever holds plain paths (mirrored into
  // the dual types/default form by `deriveDistExports` below) — only
  // `publishConfig.exports` holds the dual-entry object form.
  exports: Record<string, string>;
  publishConfig: {
    access: string;
    exports: Record<string, ExportValue>;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const pkg: FrescoUiPackageJson = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
);

function relPathOf(value: ExportValue) {
  return (typeof value === 'string' ? value : value.default).replace(
    /^\.\//,
    '',
  );
}

describe('fresco-ui exports map', () => {
  it('resolves every exports value to a file that exists on disk', () => {
    for (const [subpath, value] of Object.entries(pkg.exports)) {
      const relPath = relPathOf(value);
      expect(
        existsSync(resolve(packageRoot, relPath)),
        `${subpath} -> ${relPath} does not exist`,
      ).toBe(true);
    }
  });

  it('matches every non-CSS exports value against the canonical build globs', () => {
    // A single combined glob match already accounts for both the include
    // pattern and the stories/test/spec/TestHelpers/__tests__ excludes, since
    // BUILD_GLOB_PATTERNS' negation entries apply within the same globSync call.
    const buildableFiles = new Set(
      globSync(BUILD_GLOB_PATTERNS, { cwd: packageRoot }),
    );

    for (const [subpath, value] of Object.entries(pkg.exports)) {
      const relPath = relPathOf(value);
      if (relPath.endsWith('.css')) continue;

      expect(
        buildableFiles.has(relPath),
        `${subpath} -> ${relPath} is not matched by BUILD_GLOB_PATTERNS`,
      ).toBe(true);
    }
  });

  it('keeps publishConfig.exports in sync with the generated dist map', () => {
    expect(pkg.publishConfig.exports).toEqual(deriveDistExports(pkg.exports));
  });
});
