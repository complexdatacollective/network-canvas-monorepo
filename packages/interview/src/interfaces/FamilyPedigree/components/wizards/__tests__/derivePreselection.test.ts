import { describe, expect, it } from 'vitest';

import type { FamilyEdge, VariableConfig } from '../../../store';
import { derivePreselection } from '../derivePreselection';

const config: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function edge(
  from: string,
  to: string,
  rel: string,
  opts: { gameteRole?: 'egg' | 'sperm'; isGC?: boolean } = {},
): [string, FamilyEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    {
      _uid: id,
      type: 'family',
      from,
      to,
      attributes: opts.isGC
        ? { rel, isActive: true, isGC: true }
        : { rel, isActive: true },
      ...(opts.gameteRole ? { gameteRole: opts.gameteRole } : {}),
    },
  ];
}

describe('derivePreselection', () => {
  it('assigns egg and sperm sources by recorded gamete role', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('mum', 'child', 'biological', { gameteRole: 'egg' }),
      edge('dad', 'child', 'biological', { gameteRole: 'sperm' }),
    ]);
    expect(derivePreselection('child', edges, config)).toEqual({
      eggSource: 'mum',
      spermSource: 'dad',
    });
  });

  it('preselects a separate gestational carrier as the carrier, not the egg parent', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('eggDonor', 'child', 'donor', { gameteRole: 'egg' }),
      edge('spermDonor', 'child', 'donor', { gameteRole: 'sperm' }),
      edge('surrogate', 'child', 'surrogate', { isGC: true }),
    ]);
    expect(derivePreselection('child', edges, config)).toEqual({
      eggSource: 'eggDonor',
      spermSource: 'spermDonor',
      eggParentCarried: false,
      carrier: 'surrogate',
    });
  });

  it('leaves the egg parent as the carrier when they carried the pregnancy themselves', () => {
    // The egg parent who carried is a genetic edge flagged as the carrier; with
    // no separate surrogate edge, eggParentCarried defaults to true (unset).
    const edges = new Map<string, FamilyEdge>([
      edge('mum', 'child', 'biological', { gameteRole: 'egg', isGC: true }),
      edge('dad', 'child', 'biological', { gameteRole: 'sperm' }),
    ]);
    expect(derivePreselection('child', edges, config)).toEqual({
      eggSource: 'mum',
      spermSource: 'dad',
    });
  });

  it('falls back to positional order when gamete roles are not recorded', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('a', 'child', 'biological'),
      edge('b', 'child', 'biological'),
    ]);
    expect(derivePreselection('child', edges, config)).toEqual({
      eggSource: 'a',
      spermSource: 'b',
    });
  });

  it('ignores partner edges', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('mum', 'child', 'biological', { gameteRole: 'egg' }),
      edge('spouse', 'child', 'partner'),
    ]);
    expect(derivePreselection('child', edges, config)).toEqual({
      eggSource: 'mum',
    });
  });
});
