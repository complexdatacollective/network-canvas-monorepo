import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '../SyntheticInterview';

describe('minted ids vs caller-supplied ids', () => {
  it('never overwrites an explicitly supplied variable id with a later minted id', () => {
    const si = new SyntheticInterview(42);
    // Mints 'node-type-42-1' and the seeded name variable 'var-42-2'.
    const nt = si.addNodeType();

    // Caller supplies an id matching the mint pattern.
    const a = nt.addVariable({ name: 'A', type: 'text', id: 'var-42-3' });
    expect(a.id).toBe('var-42-3');

    // Auto-minted id for B; must not collide with A's supplied id.
    const b = nt.addVariable({ name: 'B', type: 'number' });

    const protocol = si.getProtocol();
    const nodeType = protocol.codebook.node[nt.id] as Record<string, unknown>;
    const variables = nodeType.variables as Record<
      string,
      { name: string; type: string }
    >;

    // Correct behaviour: both variables survive, and 'var-42-3' still
    // resolves to A's declaration (a text variable).
    expect(variables['var-42-3']).toEqual(
      expect.objectContaining({ name: 'A', type: 'text' }),
    );
    const names = Object.values(variables).map((v) => v.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(b.id).not.toBe(a.id);
  });
});
