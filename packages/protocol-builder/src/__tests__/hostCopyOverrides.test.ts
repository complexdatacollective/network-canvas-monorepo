import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// The jsdom environment does not give this module a `file:` URL, so the
// package root comes from the runner's working directory instead. It is
// asserted below rather than assumed, so a runner that moves makes this test
// fail rather than quietly checking nothing.
const packageSource = join(process.cwd(), 'src');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const FIXTURE = /(\.test\.|\.stories\.|__tests__|__mocks__)/;

/**
 * The one area whose conversion has not landed yet.
 *
 * `resources/` is the localisation branch's to convert, and until that lands
 * `resourceKinds.ts` still holds a `ResourcePickerCopy` of plain strings.
 * Excluded by directory rather than by file, and deliberately narrow: it is
 * the one place in the package the rule below does not yet hold, and the
 * exclusion goes with that conversion.
 *
 * The five interface families under `sections/` — `network`, `pedigree`,
 * `narrativePedigree`, `geospatial` and `anonymisation` — were excluded here
 * while their sections still took a `copy?: Partial<…Copy>` each. They are
 * converted now: every word each family says is a `MessageDescriptor`
 * declared in that family's own `*Messages.ts` (the areas are listed in
 * `src/locales/ID_MAP.md`), so the scan below covers them like anything else,
 * and a section that reintroduced the seam would fail it.
 */
const NOT_CONVERTED_YET = /^resources\//;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (
      !SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      return [];
    }
    if (FIXTURE.test(path)) return [];
    return NOT_CONVERTED_YET.test(relative(packageSource, path)) ? [] : [path];
  });
}

/**
 * A `copy` prop is a hole a host drops English into.
 *
 * Several sections used to take `copy?: Partial<…Copy>` so a host could rename
 * what they call a stage. Nothing ever passed one, and a string handed in that
 * way is invisible to `extractMessages`, absent from `src/locales/en.json`,
 * uncovered by the catalog guards and untranslatable — so the seam guaranteed
 * that the one place a host cared enough to customise was the one place that
 * stayed English. A caller that needs different words passes
 * `MessageDescriptor`s instead, which extraction still sees.
 *
 * Written as a source scan rather than as a type test because the defect is
 * the SHAPE of the prop, not any one component's signature: a new section
 * copying an old one is exactly how the seam would come back, and a type test
 * only covers the components somebody remembered to name.
 */
const COPY_PROP = /^\s*copy\??\s*:/m;

/**
 * A `…Copy` type is fine — the resource pickers use one — as long as it holds
 * descriptors. One holding `string` is the same hole with the prop renamed.
 */
const COPY_TYPE_BLOCK = /(?:export\s+)?type\s+\w*Copy\s*=\s*([\s\S]*?);\n/g;

describe('host copy overrides', () => {
  it('is looking at this package’s own source', () => {
    expect(existsSync(join(packageSource, 'protocol-context.ts'))).toBe(true);
    expect(sourceFiles(packageSource).length).toBeGreaterThan(20);
  });

  it('declares no copy prop anywhere in the package', () => {
    const offenders = sourceFiles(packageSource).flatMap((path) =>
      COPY_PROP.test(readFileSync(path, 'utf8'))
        ? [relative(packageSource, path)]
        : [],
    );

    expect(offenders).toEqual([]);
  });

  it('carries message descriptors in every copy bundle it keeps', () => {
    const offenders = sourceFiles(packageSource).flatMap((path) => {
      const contents = readFileSync(path, 'utf8');
      return [...contents.matchAll(COPY_TYPE_BLOCK)].flatMap((match) => {
        const body = match[1] ?? '';
        // A bundle of words a caller may supply has to be descriptors: a
        // `string` member is a translation that never happens.
        return body.includes('MessageDescriptor') && !/:\s*string/.test(body)
          ? []
          : [`${relative(packageSource, path)} — ${match[0].trim()}`];
      });
    });

    expect(offenders).toEqual([]);
  });
});
