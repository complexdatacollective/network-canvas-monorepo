import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { filter } from '@codaco/network-query';
import type { Filter } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

type Stage = {
  id: string;
  filter?: Filter;
  panels?: { filter: Filter }[];
  prompts?: { additionalAttributes?: { variable: string; value: boolean }[] }[];
};

type CegrmProtocol = { stages: Stage[] };

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary.
const protocol =
  require('@codaco/protocols/templates/eco-genetic-relationship-maps') as CegrmProtocol;

const getStage = (id: string): Stage => {
  const stage = protocol.stages.find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`The CEGRM template has no stage ${id}`);
  return stage;
};

const person = (
  id: string,
  attributes: NcNode[typeof entityAttributesProperty],
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: 'person',
  [entityAttributesProperty]: attributes,
});

// Four people, as the stages see them part-way through an interview.
const network: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego-entity',
    [entityAttributesProperty]: {},
  },
  nodes: [
    // A parent the pedigree added without the participant describing them.
    person('placeholder-parent', { name: '', living_status: 'unknown' }),
    // A relative the participant described.
    person('described-relative', { name: 'Ana', genderIdentity: 'woman' }),
    // The participant.
    person('participant', { name: 'You', is_ego: true, genderIdentity: 'man' }),
    // A friend named in "People in your life".
    person('friend', { name: 'Sam', non_kin: true }),
  ],
  edges: [],
};

const idsAfter = (stageId: string): string[] => {
  const stageFilter = getStage(stageId).filter;
  if (!stageFilter) throw new Error(`Stage ${stageId} has no filter`);
  return filter(stageFilter)(network).nodes.map(
    (node) => node[entityPrimaryKeyProperty] as string,
  );
};

describe('the CEGRM template tells family from non-kin by the non_kin mark', () => {
  it('sets non_kin on every person the non-kin name generator creates', () => {
    const prompts = getStage('ng-non-kin').prompts ?? [];
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.additionalAttributes).toEqual([
        { variable: 'non_kin', value: true },
      ]);
    }
  });

  it('sorts only the named non-kin people by how the participant knows them', () => {
    expect(idsAfter('bin-tie-type')).toEqual(['friend']);
  });

  it('offers only non-kin people in the already-named panel', () => {
    const panelFilter = getStage('ng-non-kin').panels?.[0]?.filter;
    if (!panelFilter) throw new Error('The non-kin stage has no panel filter');
    expect(
      filter(panelFilter)(network).nodes.map(
        (node) => node[entityPrimaryKeyProperty],
      ),
    ).toEqual(['friend']);
  });

  it('asks the family roles about every pedigree person, described or not', () => {
    expect(idsAfter('socio-roles')).toEqual([
      'placeholder-parent',
      'described-relative',
    ]);
  });

  it('keeps the participant out of both stages', () => {
    expect(idsAfter('bin-tie-type')).not.toContain('participant');
    expect(idsAfter('socio-roles')).not.toContain('participant');
  });

  it('still brings everyone but the participant to the whole-network stages', () => {
    for (const id of ['bin-closeness', 'socio-exchanges', 'narrative-cegrm']) {
      expect(idsAfter(id)).toEqual([
        'placeholder-parent',
        'described-relative',
        'friend',
      ]);
    }
  });
});
