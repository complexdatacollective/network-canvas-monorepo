import { describe, expect, it } from 'vitest';

import {
  BOTH_PATHS,
  classifySurfacePath,
  DEPLOYMENT_MODES,
  gatedSurfacePaths,
  isSurfaceServed,
  MANAGED_ONLY_PATHS,
  SELF_HOST_ONLY_PATHS,
  SURFACE_PATHS,
  unclassifiedSurfacePaths,
} from '@codaco/studio-rpc/surfaces';

// @codaco/studio-rpc carries no test runner of its own; its surfaces module is
// exercised here, in the suite of the deployable whose HTTP gate reads it.

describe('the surface classification', () => {
  it('classifies every declared path exactly once', () => {
    // A duplicate would be silently absorbed by the lookup, taking whichever
    // list is built last — so count the paths as well as classify them.
    expect(new Set(SURFACE_PATHS).size).toBe(SURFACE_PATHS.length);
    expect(SURFACE_PATHS.length).toBe(
      MANAGED_ONLY_PATHS.length +
        SELF_HOST_ONLY_PATHS.length +
        BOTH_PATHS.length,
    );
    expect(unclassifiedSurfacePaths(SURFACE_PATHS)).toEqual([]);
  });

  it('names a path that is in none of the lists', () => {
    // The oracle behind the client's route-tree test: a route added without a
    // topology decision has to be reported, not absorbed into "both".
    expect(unclassifiedSurfacePaths(['/pricing', '/unclassified'])).toEqual([
      '/unclassified',
    ]);
    expect(classifySurfacePath('/unclassified')).toBeUndefined();
  });

  it('writes every path as an absolute route path', () => {
    expect(SURFACE_PATHS.filter((path) => !path.startsWith('/'))).toEqual([]);
  });

  it('serves the origin root in both topologies', () => {
    // A self-hoster's root is the URL they hand their researchers; 404ing it
    // would make the instance dead at the address people type.
    for (const mode of DEPLOYMENT_MODES) {
      expect(isSurfaceServed('/', mode)).toBe(true);
    }
  });

  it('gates in both directions', () => {
    expect(gatedSurfacePaths('self-hosted')).toEqual([...MANAGED_ONLY_PATHS]);
    expect(gatedSurfacePaths('managed')).toEqual([...SELF_HOST_ONLY_PATHS]);
  });

  it('answers the predicate and the gate identically', () => {
    for (const mode of DEPLOYMENT_MODES) {
      const gated = new Set(gatedSurfacePaths(mode));
      for (const path of SURFACE_PATHS) {
        expect({ mode, path, served: isSurfaceServed(path, mode) }).toEqual({
          mode,
          path,
          served: !gated.has(path),
        });
      }
    }
  });
});
