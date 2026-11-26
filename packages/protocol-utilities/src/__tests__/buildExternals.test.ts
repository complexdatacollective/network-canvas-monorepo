import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// The `build.rollupOptions.external` list of the package's vite config.
const loadExternals = async (): Promise<(string | RegExp)[]> => {
  const module: unknown = await import(join(packageRoot, 'vite.config.ts'));
  const config = isRecord(module) ? module.default : undefined;
  const build = isRecord(config) ? config.build : undefined;
  const rollupOptions = isRecord(build) ? build.rollupOptions : undefined;
  const external = isRecord(rollupOptions) ? rollupOptions.external : undefined;
  if (!Array.isArray(external)) throw new Error('No external list');
  return external.filter(
    (entry): entry is string | RegExp =>
      typeof entry === 'string' || entry instanceof RegExp,
  );
};

const sourceFilesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFilesUnder(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });

// Every package the published source loads: imports, re-exports,
// side-effect imports and dynamic imports, but not relative modules.
const packageSpecifiers = () =>
  new Set(
    sourceFilesUnder(join(packageRoot, 'src')).flatMap((path) =>
      [
        ...readFileSync(path, 'utf8').matchAll(
          /(?:\bfrom\s+|^import\s+|\bimport\s*\(\s*)'([^']+)'/gm,
        ),
      ]
        .map((match) => match[1] ?? '')
        .filter((specifier) => !specifier.startsWith('.')),
    ),
  );

describe('the published bundle', () => {
  // A package left out of `external`, or a subpath of one the list names
  // only exactly, is copied into dist instead of imported, so the published
  // package carries a second copy of it (edge identity among them).
  it('imports every package the source uses instead of bundling it', async () => {
    const externals = await loadExternals();
    const specifiers = [...packageSpecifiers()];
    expect(specifiers).toContain('@codaco/shared-consts/edge-identity');
    expect(
      specifiers.filter(
        (specifier) =>
          !externals.some((external) =>
            typeof external === 'string'
              ? external === specifier
              : external.test(specifier),
          ),
      ),
    ).toEqual([]);
  });
});
