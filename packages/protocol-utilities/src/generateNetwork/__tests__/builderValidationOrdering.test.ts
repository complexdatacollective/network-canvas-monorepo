import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '../../SyntheticInterview';

/**
 * A redeclaration that fails validation must leave the builder as it was.
 * Assigning first and validating after left the rejected metadata on the
 * stored entry, so a caller that caught the error and carried on still got it
 * back out of `getProtocol()`.
 */

describe('a redeclaration the builder refuses', () => {
  it('leaves a node variable as it was', () => {
    const si = new SyntheticInterview(1);
    const nt = si.addNodeType();
    const variable = nt.addVariable({ type: 'number', name: 'age' });

    expect(() =>
      nt.addVariable({
        id: variable.id,
        type: 'number',
        name: 'age',
        synthetic: { generator: 'personName' },
      } as never),
    ).toThrow();

    const stored = (
      si.getProtocol().codebook.node?.[nt.id] as
        | { variables?: Record<string, { synthetic?: unknown }> }
        | undefined
    )?.variables?.[variable.id];
    expect(stored?.synthetic).toBeUndefined();
  });

  it('leaves an edge variable as it was', () => {
    const si = new SyntheticInterview(1);
    const et = si.addEdgeType();
    const variable = et.addVariable({ type: 'number', name: 'weight' });

    expect(() =>
      et.addVariable({
        id: variable.id,
        type: 'number',
        name: 'weight',
        synthetic: { generator: 'personName' },
      } as never),
    ).toThrow();

    const stored = (
      si.getProtocol().codebook.edge?.[et.id] as
        | { variables?: Record<string, { synthetic?: unknown }> }
        | undefined
    )?.variables?.[variable.id];
    expect(stored?.synthetic).toBeUndefined();
  });
});
