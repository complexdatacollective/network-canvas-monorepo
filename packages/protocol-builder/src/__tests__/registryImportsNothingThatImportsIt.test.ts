import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The registry must be the top of its own import graph.
 *
 * `stageEditorRegistry.ts` imports every family's part, so any module below it
 * that imports the registry back puts the two in a cycle — and a cycle here is
 * not a lint warning but a crash, in whichever direction a program happens to
 * enter it. Reach the part first and the registry evaluates beneath it with
 * the part's own binding still uninitialised, so `REGISTRY_PARTS` is built out
 * of `undefined` and `composeStageEditorRegistry` throws `Cannot convert
 * undefined or null to object`. Reach the registry first and it is the part
 * that is half-built. All three editor families hit this while wiring in their
 * first part, each from a different entry point, which is the tell: which
 * module a program reaches first is not something a family controls.
 *
 * The fix was to move `defineStageEditorPart` and `StageEditorRegistryPart`
 * into `stage-editor-contract.ts`, which imports the controller and the stage
 * types and nothing else. `type-tests/partFromRegistry.ts` holds the specific
 * route shut — the helper is not reachable through the registry, so a family
 * cannot import it from there. This holds the general rule: whatever a part
 * imports, and whatever that imports, none of it may come back here.
 *
 * Read out of the source rather than by loading the modules, because loading
 * them is what the rule exists to make safe: a cycle that crashes on import
 * would fail this file before it could report which import closed it, and one
 * that merely half-initialises a binding would not fail it at all.
 */
const packageSource = join(process.cwd(), 'src');
const registry = join(packageSource, 'stageEditorRegistry.ts');

/**
 * Every relative specifier a module names, whether or not it is a type-only
 * import.
 *
 * Type-only imports are erased and cannot close a runtime cycle, so following
 * them is deliberately stricter than the failure it prevents. A `import type`
 * edge that a later edit turns into a value import is the same cycle arriving
 * silently, and there is no reason for anything under the registry to name it
 * even in a type position.
 */
const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.[^'"]*)['"]/gm;

function relativeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(RELATIVE_SPECIFIER)].flatMap((match) => {
    const specifier = match[1];
    if (specifier === undefined) return [];
    const target = resolve(dirname(file), specifier);
    // Package source names its own files with explicit extensions, so a
    // specifier that does not resolve to a file is a CSS or asset import the
    // module graph this test is about does not run through.
    return existsSync(target) && statSync(target).isFile() ? [target] : [];
  });
}

const shortName = (file: string) => relative(packageSource, file);

/** The first import path from the registry back to itself, if there is one. */
function cycleBackToRegistry(): string[] | undefined {
  const seen = new Set([registry]);
  const queue: string[][] = [[registry]];

  while (queue.length > 0) {
    const path = queue.shift();
    if (path === undefined) break;
    const file = path.at(-1);
    if (file === undefined) break;

    for (const imported of relativeImports(file)) {
      if (imported === registry) return [...path, imported];
      if (seen.has(imported)) continue;
      seen.add(imported);
      queue.push([...path, imported]);
    }
  }

  return undefined;
}

describe('the module graph under the registry', () => {
  it('reaches nothing that imports the registry back', () => {
    const cycle = cycleBackToRegistry();

    expect(
      cycle,
      cycle === undefined
        ? ''
        : `A module the registry imports imports it back, so whichever of the two a program loads first leaves the other half-evaluated: ${cycle.map(shortName).join(' -> ')}. A family declares its part with defineStageEditorPart from stage-editor-contract.ts, which imports nothing from here.`,
    ).toBeUndefined();
  });

  /**
   * The control. A walk that resolved nothing would pass this file while
   * saying nothing at all, and the graph it is really about — every family
   * part — is empty on a branch where no family has landed yet.
   */
  it('is walked, not merely declared', () => {
    expect(relativeImports(registry).map(shortName)).toContain(
      'stage-editor-contract.ts',
    );
    expect(
      [
        ...new Set(
          relativeImports(join(packageSource, 'stage-editor-contract.ts')).map(
            shortName,
          ),
        ),
      ].toSorted(),
    ).toEqual(['controller.ts', 'stage-types.ts']);
  });
});
