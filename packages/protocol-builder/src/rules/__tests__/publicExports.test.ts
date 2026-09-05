import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
});
