import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type * as RuleDescriptionModule from '../ruleDescription.ts';
import { testCodebook } from './fixtures.ts';

/**
 * `describeRule` is the package's one public rule export, and its consumer —
 * the printable protocol summary — has not been written yet. Until it is,
 * nothing would notice the subpath disappearing from `exports`, being pointed
 * at a file that no longer exists, or losing the function itself: the package's
 * own code reaches the module by relative path and would go on working.
 */
const SUBPATH = './rules/ruleDescription';

type PackageManifest = { exports?: Record<string, string> };

const manifest = (): PackageManifest =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageManifest;

describe('the rule description a host imports', () => {
  it('is published on its own subpath', () => {
    expect(manifest().exports?.[SUBPATH]).toBe(
      './src/rules/ruleDescription.ts',
    );
  });

  it('resolves through that subpath and reads a rule', async () => {
    const target = manifest().exports?.[SUBPATH];
    expect(target).toBeDefined();

    // Imported the way a host reaches it — through the entry the exports map
    // names — rather than by the relative path this package uses internally.
    const module = (await import(
      /* @vite-ignore */ join(process.cwd(), target!)
    )) as typeof RuleDescriptionModule;

    expect(
      module.describeRule({
        rule: {
          id: 'rule-1',
          type: 'node',
          options: { type: 'person', operator: 'EXISTS' },
        },
        codebook: testCodebook,
      }).text,
    ).toBe('Person exists');
  });

  /**
   * Nothing this export reaches may come from a UI package.
   *
   * `describeRule` is pure on purpose: a host with a validated protocol and no
   * editing session — the printable summary, an archive job, a server — reads a
   * rule through it. `@codaco/fresco-ui` is React, and pulling it into that
   * graph would make the one import a host needs cost the whole component
   * library, in every environment including one with no DOM at all. It reached
   * it once, for a single clock read: `ruleCodebook.ts` imported `todayYmd`
   * from `@codaco/fresco-ui/form/utils/ymd`, which now lives in
   * `@codaco/shared-consts`.
   *
   * Walked statically rather than imported, because an import proves only that
   * this runtime tolerated the graph — vitest resolves fresco-ui perfectly
   * well. Every specifier counts, type-only ones included: a type import is
   * erased at runtime and still makes the package's typecheck depend on the
   * component library.
   */
  it('reaches no UI package', () => {
    const entry = resolve(process.cwd(), 'src/rules/ruleDescription.ts');
    const seen = new Set<string>();
    const external = new Set<string>();
    const queue = [entry];

    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);

      const source = readFileSync(file, 'utf8');
      // `from '<specifier>'` covers `import`, `import type` and re-exports
      // alike, which are the only ways a module reaches another one here.
      for (const [, specifier] of source.matchAll(/\bfrom\s+'([^']+)'/g)) {
        if (specifier === undefined) continue;
        if (specifier.startsWith('.')) {
          queue.push(resolve(dirname(file), specifier));
        } else {
          external.add(specifier);
        }
      }
    }

    // The walk is only meaningful if it actually followed the graph.
    expect(seen.size).toBeGreaterThan(3);
    expect([...seen].map((file) => relative(process.cwd(), file))).toContain(
      'src/rules/ruleCodebook.ts',
    );
    expect(
      [...external].filter((specifier) =>
        specifier.startsWith('@codaco/fresco-ui'),
      ),
    ).toEqual([]);
  });
});
