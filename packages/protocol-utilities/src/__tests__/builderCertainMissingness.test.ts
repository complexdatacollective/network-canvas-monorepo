import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { SyntheticInterview } from '../SyntheticInterview';

describe('builder draws vs certainly-missing unique variables', () => {
  // A boolean `unique` variable has a 2-value space. Declared always-missing
  // (missingProbability: 1), the final network holds no values for it at all,
  // so ANY number of nodes must be constructible — the plan path guarantees
  // exactly this by removing certainly-missing groups from the draw set
  // before drawing (networkPlan.ts certainlyMissingVariables).
  it('builds 3 procedural nodes whose always-missing unique boolean is never drawn', () => {
    const si = new SyntheticInterview(7);
    const nt = si.addNodeType();
    const flag = nt.addVariable({
      type: 'boolean',
      name: 'flag',
      validation: { unique: true },
      synthetic: { missingProbability: 1 },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 3 },
    });

    const network = si.getNetwork();
    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty]).not.toHaveProperty(flag.id);
    }
  });

  it('builds 3 edges whose always-missing unique boolean edge variable is never drawn', () => {
    const si = new SyntheticInterview(7);
    const nt = si.addNodeType();
    const et = si.addEdgeType();
    const bond = et.addVariable({
      type: 'boolean',
      name: 'bond',
      validation: { unique: true },
      synthetic: { missingProbability: 1 },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 4 },
    });
    si.addEdges(
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      et.id,
    );

    const network = si.getNetwork();
    expect(network.edges).toHaveLength(3);
    for (const edge of network.edges) {
      expect(edge[entityAttributesProperty]).not.toHaveProperty(bond.id);
    }
  });
});
