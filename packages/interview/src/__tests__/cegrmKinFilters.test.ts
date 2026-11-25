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
  type: string;
  label: Record<string, string>;
  filter?: Filter;
  panels?: { filter: Filter }[];
  presets?: { id: string; filter?: Filter }[];
  prompts?: {
    additionalAttributes?: { id: string; variable: string; value: boolean }[];
  }[];
};

type CodebookEntry = { name: string };

type CegrmProtocol = {
  stages: Stage[];
  codebook: {
    node: Record<
      string,
      CodebookEntry & { variables: Record<string, CodebookEntry> }
    >;
  };
};

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary.
const protocol =
  require('@codaco/protocols/templates/eco-genetic-relationship-maps') as CegrmProtocol;

type StageKey = { type: string; label: string };

// Stage ids are UUIDs, so each stage is found by its type and English label.
const nonKinNameGenerator = {
  type: 'NameGeneratorQuickAdd',
  label: 'People in your life',
};
const tieTypeBin = {
  type: 'CategoricalBin',
  label: 'How you know each person',
};
const closenessBin = { type: 'OrdinalBin', label: 'How close you feel' };
const exchangesSociogram = { type: 'Sociogram', label: 'Exchanges of support' };
const rolesSociogram = {
  type: 'Sociogram',
  label: 'Talking about the condition',
};
const completedMapNarrative = { type: 'Narrative', label: 'The completed map' };

const getStage = ({ type, label }: StageKey): Stage => {
  const matches = protocol.stages.filter(
    (candidate) => candidate.type === type && candidate.label.en === label,
  );
  const [stage] = matches;
  if (!stage || matches.length > 1) {
    throw new Error(`The CEGRM template has no single ${type} "${label}"`);
  }
  return stage;
};

// Codebook ids are UUIDs, so the type and its variables are found by name.
const keyNamed = (record: Record<string, CodebookEntry>, name: string) => {
  const matches = Object.keys(record).filter(
    (key) => record[key]?.name === name,
  );
  const [key] = matches;
  if (key === undefined || matches.length > 1) {
    throw new Error(`The CEGRM template has no single "${name}"`);
  }
  return key;
};

const personType = keyNamed(protocol.codebook.node, 'Person');
const personVariables = protocol.codebook.node[personType]?.variables ?? {};
const variableId = (name: string) => keyNamed(personVariables, name);

const person = (
  id: string,
  attributes: NcNode[typeof entityAttributesProperty],
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: personType,
  [entityAttributesProperty]: Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      variableId(name),
      value,
    ]),
  ),
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

const idsLeftBy = (applied: Filter): string[] =>
  filter(applied)(network).nodes.map(
    (node) => node[entityPrimaryKeyProperty] as string,
  );

const idsAfter = (key: StageKey): string[] => {
  const stageFilter = getStage(key).filter;
  if (!stageFilter) throw new Error(`Stage "${key.label}" has no filter`);
  return idsLeftBy(stageFilter);
};

describe('the CEGRM template tells family from non-kin by the non_kin mark', () => {
  it('sets non_kin on every person the non-kin name generator creates', () => {
    const prompts = getStage(nonKinNameGenerator).prompts ?? [];
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(
        prompt.additionalAttributes?.map(({ variable, value }) => ({
          variable,
          value,
        })),
      ).toEqual([{ variable: variableId('non_kin'), value: true }]);
    }
  });

  it('sorts only the named non-kin people by how the participant knows them', () => {
    expect(idsAfter(tieTypeBin)).toEqual(['friend']);
  });

  it('offers only non-kin people in the already-named panel', () => {
    const panelFilter = getStage(nonKinNameGenerator).panels?.[0]?.filter;
    if (!panelFilter) throw new Error('The non-kin stage has no panel filter');
    expect(
      filter(panelFilter)(network).nodes.map(
        (node) => node[entityPrimaryKeyProperty],
      ),
    ).toEqual(['friend']);
  });

  it('asks the family roles about every pedigree person, described or not', () => {
    expect(idsAfter(rolesSociogram)).toEqual([
      'placeholder-parent',
      'described-relative',
    ]);
  });

  it('keeps the participant out of both stages', () => {
    expect(idsAfter(tieTypeBin)).not.toContain('participant');
    expect(idsAfter(rolesSociogram)).not.toContain('participant');
  });

  it('still brings everyone but the participant to the whole-network stages', () => {
    for (const key of [closenessBin, exchangesSociogram]) {
      expect(idsAfter(key)).toEqual([
        'placeholder-parent',
        'described-relative',
        'friend',
      ]);
    }
  });

  // A Narrative has no filter of its own: each preset narrows the network for
  // itself, so every preset has to keep the participant out.
  it('brings everyone but the participant to every preset of the narrative', () => {
    const presets = getStage(completedMapNarrative).presets ?? [];
    expect(presets).toHaveLength(3);
    for (const preset of presets) {
      if (!preset.filter) throw new Error(`Preset ${preset.id} has no filter`);
      expect(idsLeftBy(preset.filter)).toEqual([
        'placeholder-parent',
        'described-relative',
        'friend',
      ]);
    }
  });
});
