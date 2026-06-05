import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { egoCellTransform } from '../egoCellTransform';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('egoCellTransform', () => {
  it('transforms nuclear family (2 bio parents, current partners)', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [{ id: 'sperm-parent', value: 'current' }],
      },
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    // 3 nodes: ego + 2 parents
    expect(batch.nodes).toHaveLength(3);
    expect(batch.nodes[0]).toMatchObject({ tempId: 'ego' });
    expect(batch.nodes[1]).toMatchObject({
      tempId: 'egg-parent',
      data: {
        attributes: { name: 'Linda', isEgo: false },
      },
    });
    expect(batch.nodes[2]).toMatchObject({
      tempId: 'sperm-parent',
      data: {
        attributes: { name: 'Robert', isEgo: false },
      },
    });

    // 3 edges: 2 parent→ego + 1 partner
    expect(batch.edges).toHaveLength(3);

    // Egg parent edge: biological + GC
    expect(batch.edges[0]).toMatchObject({
      source: 'egg-parent',
      target: 'ego',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: 'biological',
          [variableConfig.isActiveVariable]: true,
          [variableConfig.isGestationalCarrierVariable]: true,
        },
      },
    });

    // Sperm parent edge: biological, no GC
    expect(batch.edges[1]).toMatchObject({
      source: 'sperm-parent',
      target: 'ego',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: 'biological',
          [variableConfig.isActiveVariable]: true,
        },
      },
    });
    expect(
      batch.edges[1]?.data.attributes[
        variableConfig.isGestationalCarrierVariable
      ],
    ).toBeUndefined();

    // Partnership: current
    expect(batch.edges[2]).toMatchObject({
      source: 'egg-parent',
      target: 'sperm-parent',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: 'partner',
          [variableConfig.isActiveVariable]: true,
        },
      },
    });
  });

  it('transforms same-sex mothers with sperm donor + social parent', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': true,
        'name': '',
      },
      'hasOtherParents': true,
      'otherParentCount': 1,
      'additional-parent': [{ role: 'raised-me', name: 'Patricia' }],
      'partnerships': {
        'egg-parent': [
          { id: 'sperm-parent', value: 'none' },
          { id: 'additional-parent-0', value: 'current' },
        ],
        'sperm-parent': [{ id: 'additional-parent-0', value: 'none' }],
      },
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    // 4 nodes: ego + egg + donor + Patricia
    expect(batch.nodes).toHaveLength(4);
    expect(batch.nodes[3]).toMatchObject({
      tempId: 'additional-parent-0',
      data: { attributes: { name: 'Patricia' } },
    });

    // Sperm parent is donor
    const donorEdge = batch.edges.find((e) => e.source === 'sperm-parent');
    expect(donorEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: 'donor',
      [variableConfig.isActiveVariable]: true,
    });

    // Additional parent is social
    const socialEdge = batch.edges.find(
      (e) => e.source === 'additional-parent-0',
    );
    expect(socialEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: 'social',
      [variableConfig.isActiveVariable]: true,
    });

    // Only 1 partnership (Linda + Patricia current), others are 'none'
    const partnerships = batch.edges.filter(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
        'partner',
    );
    expect(partnerships).toHaveLength(1);
    expect(partnerships[0]).toMatchObject({
      source: 'egg-parent',
      target: 'additional-parent-0',
      data: {
        attributes: { [variableConfig.isActiveVariable]: true },
      },
    });

    // Donor node has empty name
    expect(batch.nodes[2]).toMatchObject({
      tempId: 'sperm-parent',
      data: { attributes: { name: '' } },
    });
  });

  it('transforms single parent with two donors + gestational carrier', () => {
    const values = {
      'egg-parent': {
        'is-donor': true,
        'name': '',
        'gestationalCarrier': false,
      },
      'sperm-parent': {
        'is-donor': true,
        'name': '',
      },
      'gestational-carrier': {
        name: 'Mum',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [
          { id: 'sperm-parent', value: 'none' },
          { id: 'gestational-carrier', value: 'none' },
        ],
        'sperm-parent': [{ id: 'gestational-carrier', value: 'none' }],
      },
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    // 4 nodes: ego + egg donor + sperm donor + GC
    expect(batch.nodes).toHaveLength(4);

    // Egg parent: donor edge, NO GC flag (she didn't carry)
    const eggEdge = batch.edges.find((e) => e.source === 'egg-parent');
    expect(eggEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: 'donor',
    });
    expect(
      eggEdge?.data.attributes[variableConfig.isGestationalCarrierVariable],
    ).toBeUndefined();

    // Sperm parent: donor edge
    const spermEdge = batch.edges.find((e) => e.source === 'sperm-parent');
    expect(spermEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: 'donor',
    });

    // Gestational carrier: always a (non-genetic) surrogate + GC flag
    const gcEdge = batch.edges.find((e) => e.source === 'gestational-carrier');
    expect(gcEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: 'surrogate',
      [variableConfig.isGestationalCarrierVariable]: true,
    });

    // GC node has name 'Mum'
    const gcNode = batch.nodes.find((n) => n.tempId === 'gestational-carrier');
    expect(gcNode?.data.attributes).toMatchObject({ name: 'Mum' });

    // No partnerships
    const partnerships = batch.edges.filter(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
        'partner',
    );
    expect(partnerships).toHaveLength(0);
  });

  it('transforms blended family with ex + current partnerships', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Susan',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': true,
      'otherParentCount': 1,
      'additional-parent': [{ role: 'step-parent', name: 'Karen' }],
      'partnerships': {
        'egg-parent': [
          { id: 'sperm-parent', value: 'ex' },
          { id: 'additional-parent-0', value: 'none' },
        ],
        'sperm-parent': [{ id: 'additional-parent-0', value: 'current' }],
      },
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    const partnerships = batch.edges.filter(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
        'partner',
    );
    expect(partnerships).toHaveLength(2);

    // Susan + Robert = ex (isActive: false)
    expect(partnerships[0]).toMatchObject({
      source: 'egg-parent',
      target: 'sperm-parent',
      data: {
        attributes: { [variableConfig.isActiveVariable]: false },
      },
    });

    // Robert + Karen = current (isActive: true)
    expect(partnerships[1]).toMatchObject({
      source: 'sperm-parent',
      target: 'additional-parent-0',
      data: {
        attributes: { [variableConfig.isActiveVariable]: true },
      },
    });
  });

  it('produces adoptive edges when adoptive parents are present', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': '',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': '',
      },
      'hasOtherParents': true,
      'otherParentCount': 2,
      'additional-parent': [
        { role: 'adoptive-parent', name: 'James' },
        {
          role: 'adoptive-parent',
          name: 'Barbara',
        },
      ],
      'partnerships': {
        'egg-parent': [
          { id: 'sperm-parent', value: 'none' },
          { id: 'additional-parent-0', value: 'none' },
          { id: 'additional-parent-1', value: 'none' },
        ],
        'sperm-parent': [
          { id: 'additional-parent-0', value: 'none' },
          { id: 'additional-parent-1', value: 'none' },
        ],
        'additional-parent-0': [
          { id: 'additional-parent-1', value: 'current' },
        ],
      },
    };

    const result = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    const adoptiveEdges = result.batch.edges.filter(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
        'adoptive',
    );
    expect(adoptiveEdges).toHaveLength(2);
    expect(adoptiveEdges[0]).toMatchObject({
      source: 'additional-parent-0',
      target: 'ego',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: 'adoptive',
          [variableConfig.isActiveVariable]: true,
        },
      },
    });
    expect(adoptiveEdges[1]).toMatchObject({
      source: 'additional-parent-1',
      target: 'ego',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: 'adoptive',
          [variableConfig.isActiveVariable]: true,
        },
      },
    });
  });

  it('does not produce adoptive edges when no adoptive parents', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [{ id: 'sperm-parent', value: 'current' }],
      },
    };

    const result = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    const adoptiveEdges = result.batch.edges.filter(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
        'adoptive',
    );
    expect(adoptiveEdges).toHaveLength(0);
  });

  it('uses existing ego ID and does not create ego node', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [{ id: 'sperm-parent', value: 'current' }],
      },
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
      'existing-ego-123',
    );

    const egoNode = batch.nodes.find((n) => n.tempId === 'ego');
    expect(egoNode).toBeUndefined();

    const parentEdges = batch.edges.filter(
      (e) => e.target === 'existing-ego-123',
    );
    expect(parentEdges).toHaveLength(2);
  });

  it('creates partner node and children with partner', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [{ id: 'sperm-parent', value: 'current' }],
      },
      'hasPartner': true,
      'partner': {
        name: 'Sophia',
      },
      'childrenWithPartnerCount': 2,
      'childWithPartner': [
        {
          name: 'Olivia',
          parentage: {
            'egg-source': 'ego',
            'sperm-source': 'partner',
            'egg-parent-carried': true,
          },
        },
        {
          name: 'Liam',
          parentage: {
            'egg-source': 'ego',
            'sperm-source': 'partner',
            'egg-parent-carried': true,
          },
        },
      ],
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    // ego + 2 parents + partner + 2 children = 6 nodes
    expect(batch.nodes).toHaveLength(6);

    const partnerNode = batch.nodes.find((n) => n.tempId === 'partner');
    expect(partnerNode?.data.attributes).toMatchObject({ name: 'Sophia' });

    // Partner edge: ego <-> partner
    const partnerEdge = batch.edges.find(
      (e) =>
        e.data.attributes[variableConfig.relationshipTypeVariable] ===
          'partner' && e.target === 'partner',
    );
    expect(partnerEdge).toBeDefined();

    // Children: 2 child nodes, each with biological edges from ego + partner
    // and a carrier edge from ego (egg-parent-carried: true)
    const child0 = batch.nodes.find((n) => n.tempId === 'child-0');
    const child1 = batch.nodes.find((n) => n.tempId === 'child-1');
    expect(child0?.data.attributes).toMatchObject({ name: 'Olivia' });
    expect(child1?.data.attributes).toMatchObject({ name: 'Liam' });

    // One edge per parent: ego (egg, flagged as carrier) + partner.
    const child0Edges = batch.edges.filter((e) => e.target === 'child-0');
    expect(child0Edges).toHaveLength(2);
    expect(
      child0Edges.some(
        (e) =>
          e.source === 'ego' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);
    expect(
      child0Edges.some(
        (e) =>
          e.source === 'partner' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);

    const child1Edges = batch.edges.filter((e) => e.target === 'child-1');
    expect(child1Edges).toHaveLength(2);
    expect(
      child1Edges.some(
        (e) =>
          e.source === 'ego' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);
    expect(
      child1Edges.some(
        (e) =>
          e.source === 'partner' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);
  });

  it('nuclear family: each child gets biological edges from ego and partner', () => {
    const values: Record<string, unknown> = {
      hasPartner: true,
      partner: { name: 'Partner' },
      childrenWithPartnerCount: 1,
      childWithPartner: [
        {
          name: 'Kid',
          parentage: {
            'egg-source': 'ego',
            'sperm-source': 'partner',
            'egg-parent-carried': true,
          },
        },
      ],
    };

    const { batch } = egoCellTransform(values, variableConfig);

    const child = batch.nodes.find(
      (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
    );
    expect(child).toBeDefined();
    const childId = child!.tempId;

    const childParentEdges = batch.edges.filter((e) => e.target === childId);
    // One edge per parent: ego (egg, also flagged carrier) + partner.
    expect(childParentEdges).toHaveLength(2);
    expect(
      childParentEdges.some(
        (e) =>
          e.source === 'ego' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);
    expect(
      childParentEdges.some(
        (e) =>
          e.source === 'partner' &&
          e.data.attributes[variableConfig.relationshipTypeVariable] ===
            'biological',
      ),
    ).toBe(true);
  });

  it('donor-conceived child: partner is not a parent; a donor is generated', () => {
    const values: Record<string, unknown> = {
      hasPartner: true,
      partner: { name: 'Partner' },
      childrenWithPartnerCount: 1,
      childWithPartner: [
        {
          name: 'Kid',
          parentage: {
            'egg-source': 'ego',
            'sperm-source': 'new',
            'new-sperm-source': { name: 'Donor' },
            'sperm-source-is-donor': true,
            'egg-parent-carried': true,
          },
        },
      ],
    };

    const { batch } = egoCellTransform(values, variableConfig);

    const child = batch.nodes.find(
      (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
    )!;
    const donor = batch.nodes.find(
      (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Donor',
    );
    expect(donor).toBeDefined();

    expect(
      batch.edges.some(
        (e) => e.source === 'partner' && e.target === child.tempId,
      ),
    ).toBe(false);
    const donorEdge = batch.edges.find(
      (e) => e.source === donor!.tempId && e.target === child.tempId,
    );
    expect(
      donorEdge?.data.attributes[variableConfig.relationshipTypeVariable],
    ).toBe('donor');
  });

  it('remaps the ego sentinel to an existing ego id for children', () => {
    const values: Record<string, unknown> = {
      hasPartner: true,
      partner: { name: 'Partner' },
      childrenWithPartnerCount: 1,
      childWithPartner: [
        {
          name: 'Kid',
          parentage: {
            'egg-source': 'ego',
            'sperm-source': 'partner',
            'egg-parent-carried': true,
          },
        },
      ],
    };

    const { batch } = egoCellTransform(values, variableConfig, 'real-ego-id');

    const child = batch.nodes.find(
      (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
    )!;
    expect(
      batch.edges.some(
        (e) => e.source === 'real-ego-id' && e.target === child.tempId,
      ),
    ).toBe(true);
    expect(
      batch.edges.some((e) => e.source === 'ego' && e.target === child.tempId),
    ).toBe(false);
  });

  it('skips partner and children when hasPartner is false', () => {
    const values = {
      'egg-parent': {
        'is-donor': false,
        'name': 'Linda',
        'gestationalCarrier': true,
      },
      'sperm-parent': {
        'is-donor': false,
        'name': 'Robert',
      },
      'hasOtherParents': false,
      'partnerships': {
        'egg-parent': [{ id: 'sperm-parent', value: 'current' }],
      },
      'hasPartner': false,
    };

    const { batch } = egoCellTransform(
      values as Record<string, unknown>,
      variableConfig,
    );

    // ego + 2 parents only
    expect(batch.nodes).toHaveLength(3);
    expect(batch.nodes.find((n) => n.tempId === 'partner')).toBeUndefined();
  });

  it('produces no parent edges when a child has no parentage data', () => {
    const values: Record<string, unknown> = {
      hasPartner: true,
      partner: { name: 'Partner' },
      childrenWithPartnerCount: 1,
      childWithPartner: [{ name: 'Kid' }],
    };
    const { batch } = egoCellTransform(values, variableConfig);
    const child = batch.nodes.find(
      (n) => n.data.attributes[variableConfig.nodeLabelVariable] === 'Kid',
    )!;
    expect(batch.edges.filter((e) => e.target === child.tempId)).toHaveLength(
      0,
    );
  });
});
