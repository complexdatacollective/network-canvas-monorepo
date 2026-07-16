import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { VariableConfig } from '../../store';
import {
  computeRelationshipsToEgo,
  getDisplayLabel,
} from '../utils/getDisplayLabel';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGest',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function makeNodes(
  entries: [string, { name?: string; isEgo?: boolean }][],
): Map<string, NcNode> {
  return new Map(
    entries.map(([id, { name, isEgo }]) => [
      id,
      {
        _uid: id,
        type: 'person',
        [entityAttributesProperty]: {
          [variableConfig.egoVariable]: isEgo ?? false,
          ...(name !== undefined ? { name } : {}),
        },
      },
    ]),
  );
}

function makeEdges(
  entries: [
    string,
    {
      from: string;
      to: string;
      relType: string;
      isActive?: boolean;
      gameteRole?: 'egg' | 'sperm';
    },
  ][],
): Map<string, NcEdge> {
  return new Map(
    entries.map(([id, { from, to, relType, isActive, gameteRole }]) => [
      id,
      {
        _uid: id,
        type: 'family',
        from,
        to,
        [entityAttributesProperty]: {
          [variableConfig.relationshipTypeVariable]: [relType],
          [variableConfig.isActiveVariable]: isActive ?? true,
          ...(gameteRole
            ? { [variableConfig.gameteRoleVariable]: gameteRole }
            : {}),
        },
      },
    ]),
  );
}

describe('getDisplayLabel', () => {
  it('returns stored name when present', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['dad', { name: 'Rob' }],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
    ]);

    expect(
      getDisplayLabel('dad', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Rob');
  });

  it('labels unnamed parent as "Parent"', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['dad', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
    ]);

    expect(
      getDisplayLabel('dad', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Parent');
  });

  it('labels unnamed social parent as "Social Parent"', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['step', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'step', to: 'ego', relType: 'social' }],
    ]);

    expect(
      getDisplayLabel('step', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Social Parent');
  });

  it('labels unnamed donor', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['donor', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'donor', to: 'ego', relType: 'donor' }],
    ]);

    expect(
      getDisplayLabel('donor', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Donor');
  });

  it('labels unnamed surrogate', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['surr', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'surr', to: 'ego', relType: 'surrogate' }],
    ]);

    expect(
      getDisplayLabel('surr', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Surrogate');
  });

  it('labels unnamed child as "Child"', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['kid', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'ego', to: 'kid', relType: 'biological' }],
    ]);

    expect(
      getDisplayLabel('kid', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Child');
  });

  it('labels unnamed partner as "Partner"', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['p', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'ego', to: 'p', relType: 'partner' }],
    ]);

    expect(
      getDisplayLabel('p', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Partner');
  });

  it('labels unnamed sibling as "Sibling"', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['dad', { name: 'Rob' }],
      ['sib', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
      ['e2', { from: 'dad', to: 'sib', relType: 'biological' }],
    ]);

    expect(
      getDisplayLabel('sib', 'ego', nodes, edges, variableConfig, 'gamete'),
    ).toBe('Sibling');
  });

  describe('multi-hop relationships', () => {
    it('labels unnamed grandparent with named intermediary as "{name}\'s Parent"', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', { name: 'Rob' }],
        ['grandpa', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'grandpa',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe("Rob's Parent");
    });

    it('labels unnamed grandparent without named intermediary', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', {}],
        ['grandpa', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'grandpa',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe('Grandparent');
    });

    it('labels step-parent as "{parent}\'s Partner"', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', { name: 'Rob' }],
        ['stepmom', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'dad', to: 'stepmom', relType: 'partner' }],
      ]);

      expect(
        getDisplayLabel(
          'stepmom',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe("Rob's Partner");
    });

    it('labels aunt/uncle with named intermediary', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', { name: 'Rob' }],
        ['grandpa', { name: 'Bill' }],
        ['uncle', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
        ['e3', { from: 'grandpa', to: 'uncle', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel('uncle', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe("Bill's Child");
    });

    it('labels aunt/uncle without named intermediary', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', {}],
        ['grandpa', {}],
        ['uncle', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
        ['e3', { from: 'grandpa', to: 'uncle', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel('uncle', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Aunt/Uncle');
    });

    it('labels cousin with named aunt/uncle', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', { name: 'Rob' }],
        ['grandpa', { name: 'Bill' }],
        ['uncle', { name: 'Steve' }],
        ['cousin', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
        ['e3', { from: 'grandpa', to: 'uncle', relType: 'biological' }],
        ['e4', { from: 'uncle', to: 'cousin', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'cousin',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe("Steve's Child");
    });

    it('labels niece/nephew with named sibling', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', { name: 'Rob' }],
        ['sis', { name: 'Emma' }],
        ['niece', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'dad', to: 'sis', relType: 'biological' }],
        ['e3', { from: 'sis', to: 'niece', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel('niece', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe("Emma's Child");
    });

    it('labels child-in-law with named child', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['kid', { name: 'Jake' }],
        ['inlaw', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'ego', to: 'kid', relType: 'biological' }],
        ['e2', { from: 'kid', to: 'inlaw', relType: 'partner' }],
      ]);

      expect(
        getDisplayLabel('inlaw', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe("Jake's Partner");
    });

    it('labels grandchild with named child', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['kid', { name: 'Jake' }],
        ['grandkid', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'ego', to: 'kid', relType: 'biological' }],
        ['e2', { from: 'kid', to: 'grandkid', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'grandkid',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe("Jake's Child");
    });

    it('returns "Family Member" for unreachable nodes', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['stranger', {}],
      ]);
      const edges = makeEdges([]);

      expect(
        getDisplayLabel(
          'stranger',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe('Family Member');
    });

    it('returns "Family Member" for unclassifiable paths', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['a', {}],
        ['b', {}],
        ['c', {}],
        ['d', {}],
        ['e', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'a', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'b', to: 'a', relType: 'biological' }],
        ['e3', { from: 'c', to: 'b', relType: 'biological' }],
        ['e4', { from: 'd', to: 'c', relType: 'biological' }],
        ['e5', { from: 'd', to: 'e', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel('e', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Family Member');
    });
  });

  describe('gamete-role labels', () => {
    it('labels two unnamed biological parents by gamete role (gamete framing)', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['eggp', {}],
        ['spermp', {}],
      ]);
      const edges = makeEdges([
        [
          'e1',
          { from: 'eggp', to: 'ego', relType: 'biological', gameteRole: 'egg' },
        ],
        [
          'e2',
          {
            from: 'spermp',
            to: 'ego',
            relType: 'biological',
            gameteRole: 'sperm',
          },
        ],
      ]);

      expect(
        getDisplayLabel('eggp', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Egg Parent');
      expect(
        getDisplayLabel(
          'spermp',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe('Sperm Parent');
    });

    it('labels egg biological parent as "Mother" under gendered framing', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['eggp', {}],
      ]);
      const edges = makeEdges([
        [
          'e1',
          { from: 'eggp', to: 'ego', relType: 'biological', gameteRole: 'egg' },
        ],
      ]);

      expect(
        getDisplayLabel(
          'eggp',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gendered',
        ),
      ).toBe('Mother');
    });

    it('labels sperm biological parent as "Father" under gendered framing', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['spermp', {}],
      ]);
      const edges = makeEdges([
        [
          'e1',
          {
            from: 'spermp',
            to: 'ego',
            relType: 'biological',
            gameteRole: 'sperm',
          },
        ],
      ]);

      expect(
        getDisplayLabel(
          'spermp',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gendered',
        ),
      ).toBe('Father');
    });

    it('labels an unnamed donor parent by gamete role', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['donor', {}],
      ]);
      const edges = makeEdges([
        [
          'e1',
          { from: 'donor', to: 'ego', relType: 'donor', gameteRole: 'sperm' },
        ],
      ]);

      expect(
        getDisplayLabel('donor', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Sperm Donor');
    });

    it('donor labels are identical across framings', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['donor', {}],
      ]);
      const edges = makeEdges([
        [
          'e1',
          { from: 'donor', to: 'ego', relType: 'donor', gameteRole: 'egg' },
        ],
      ]);

      expect(
        getDisplayLabel('donor', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Egg Donor');
      expect(
        getDisplayLabel(
          'donor',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gendered',
        ),
      ).toBe('Egg Donor');
    });

    it('falls back to "Parent" when no gamete role is recorded', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['p', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'p', to: 'ego', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel('p', 'ego', nodes, edges, variableConfig, 'gamete'),
      ).toBe('Parent');
    });

    it('neutral label Grandparent is identical under both framings', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', {}],
        ['grandpa', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'grandpa',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe('Grandparent');
      expect(
        getDisplayLabel(
          'grandpa',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gendered',
        ),
      ).toBe('Grandparent');
    });

    it('neutral label Cousin is identical under both framings', () => {
      const nodes = makeNodes([
        ['ego', { name: 'Me', isEgo: true }],
        ['dad', {}],
        ['grandpa', {}],
        ['uncle', {}],
        ['cousin', {}],
      ]);
      const edges = makeEdges([
        ['e1', { from: 'dad', to: 'ego', relType: 'biological' }],
        ['e2', { from: 'grandpa', to: 'dad', relType: 'biological' }],
        ['e3', { from: 'grandpa', to: 'uncle', relType: 'biological' }],
        ['e4', { from: 'uncle', to: 'cousin', relType: 'biological' }],
      ]);

      expect(
        getDisplayLabel(
          'cousin',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gamete',
        ),
      ).toBe('Cousin');
      expect(
        getDisplayLabel(
          'cousin',
          'ego',
          nodes,
          edges,
          variableConfig,
          'gendered',
        ),
      ).toBe('Cousin');
    });
  });
});

describe('computeRelationshipsToEgo', () => {
  it('labels each non-ego node by its canonical relationship kind', () => {
    // grandparent -> parent -> ego, plus a sibling of ego.
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['parent', { name: 'Mum' }],
      ['grandparent', { name: 'Gran' }],
      ['sibling', { name: 'Sib' }],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'parent', to: 'ego', relType: 'biological' }],
      ['e2', { from: 'grandparent', to: 'parent', relType: 'biological' }],
      ['e3', { from: 'parent', to: 'sibling', relType: 'biological' }],
    ]);

    const relationships = computeRelationshipsToEgo(
      'ego',
      nodes,
      edges,
      variableConfig,
    );

    expect(relationships.get('parent')).toBe('Parent');
    expect(relationships.get('grandparent')).toBe('Grandparent');
    expect(relationships.get('sibling')).toBe('Sibling');
    // Ego has no relationship to itself.
    expect(relationships.has('ego')).toBe(false);
  });

  it('refines a direct parent by edge type', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['donor', {}],
    ]);
    const edges = makeEdges([
      ['e1', { from: 'donor', to: 'ego', relType: 'donor' }],
    ]);

    const relationships = computeRelationshipsToEgo(
      'ego',
      nodes,
      edges,
      variableConfig,
    );

    expect(relationships.get('donor')).toBe('Donor');
  });

  it('omits nodes ego cannot reach', () => {
    const nodes = makeNodes([
      ['ego', { name: 'Me', isEgo: true }],
      ['stranger', { name: 'Nobody' }],
    ]);
    const edges = makeEdges([]);

    const relationships = computeRelationshipsToEgo(
      'ego',
      nodes,
      edges,
      variableConfig,
    );

    expect(relationships.has('stranger')).toBe(false);
  });
});
