import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { censusAndBinStageEditors } from '../../censusAndBinStageEditors.ts';

/** Only an interface the family actually claims can be named below. */
type ClaimedStageType = keyof typeof censusAndBinStageEditors;

/**
 * Every way into this family from outside the package.
 *
 * A host reaches a module through the `exports` map or not at all: the
 * relative paths this package uses internally are invisible to it, so the
 * package's own tests and stories go on passing after a subpath has been
 * dropped, renamed, or pointed at a file that no longer exists — and nothing
 * would notice until a consumer's build failed.
 *
 * Both grains are published, because a host wants one or the other and rarely
 * both: the family part is what a host composes into a registry of its own,
 * and each named editor is what a host mounts directly when it lays out a page
 * around one interface.
 */
const EDITOR_SUBPATHS: readonly Readonly<{
  stageType: ClaimedStageType;
  subpath: string;
  exportName: string;
}>[] = [
  {
    stageType: 'CategoricalBin',
    subpath: './editors/census/CategoricalBinStageEditor',
    exportName: 'CategoricalBinStageEditor',
  },
  {
    stageType: 'DyadCensus',
    subpath: './editors/census/DyadCensusStageEditor',
    exportName: 'DyadCensusStageEditor',
  },
  {
    stageType: 'OneToManyDyadCensus',
    subpath: './editors/census/OneToManyDyadCensusStageEditor',
    exportName: 'OneToManyDyadCensusStageEditor',
  },
  {
    stageType: 'OrdinalBin',
    subpath: './editors/census/OrdinalBinStageEditor',
    exportName: 'OrdinalBinStageEditor',
  },
  {
    stageType: 'TieStrengthCensus',
    subpath: './editors/census/TieStrengthCensusStageEditor',
    exportName: 'TieStrengthCensusStageEditor',
  },
];

const PART_SUBPATH = './editors/censusAndBinStageEditors';

type PackageManifest = { exports?: Record<string, string> };

const manifest = (): PackageManifest =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageManifest;

/**
 * Loads a subpath the way a host reaches it — through the file the exports map
 * names — rather than by the relative path this package uses internally.
 */
const importSubpath = async (
  subpath: string,
): Promise<Record<string, unknown>> => {
  const target = manifest().exports?.[subpath];
  expect(target, `${subpath} is not in the exports map`).toBeDefined();
  return (await import(
    /* @vite-ignore */ join(process.cwd(), target ?? '')
  )) as Record<string, unknown>;
};

describe('the census and bin editors a host imports', () => {
  it.each(EDITOR_SUBPATHS)(
    'resolves $exportName through $subpath, as the editor the family names',
    async ({ stageType, subpath, exportName }) => {
      const module = await importSubpath(subpath);

      // The same component the registry part maps this interface to, so a
      // subpath pointing at a plausible neighbouring file is caught.
      expect(module[exportName]).toBe(censusAndBinStageEditors[stageType]);
    },
  );

  it('resolves the family part through its own subpath', async () => {
    const module = await importSubpath(PART_SUBPATH);

    expect(module.censusAndBinStageEditors).toEqual(censusAndBinStageEditors);
  });

  /**
   * Five editors, five subpaths. A sixth editor added to the part and not to
   * the manifest would be unreachable from every host, which nothing inside
   * this package can see.
   */
  it('publishes one subpath per editor the family claims', () => {
    expect(
      Object.keys(manifest().exports ?? {}).filter((subpath) =>
        subpath.startsWith('./editors/census/'),
      ),
    ).toHaveLength(Object.keys(censusAndBinStageEditors).length);
  });
});
