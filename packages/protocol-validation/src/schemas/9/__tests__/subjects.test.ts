import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { resolveSubjectValue } from '../common/subjects.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import {
  getSingleStageNodeType,
  getStageNodeTypes,
} from '../stage-capabilities.ts';

const PERSON = 'f7a9fa56-4b42-57df-865a-ea1fc6569f42';
const PLACE = 'd2904722-c463-5fe3-8f6d-032114d8ed55';
const SOCIOGRAM_INDEX = 6;

const readFixture = (): unknown =>
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../protocols/e2e/all-interfaces/protocol.json',
      ),
      'utf8',
    ),
  );

const fixtureSociogram = () => {
  const protocol = ProtocolSchemaV9.parse(readFixture());
  const stage = protocol.stages[SOCIOGRAM_INDEX];
  if (stage?.type !== 'Sociogram') throw new Error('No Sociogram stage');
  return stage;
};

describe('resolveSubjectValue', () => {
  it.each([
    ['an ego subject', { entity: 'ego' }, { entity: 'ego' }],
    [
      'an edge subject',
      { entity: 'edge', type: 'knows' },
      { entity: 'edge', type: 'knows' },
    ],
    [
      'a singular node subject',
      { entity: 'node', type: PERSON },
      { entity: 'node', type: PERSON },
    ],
    [
      'a node subject listing one type',
      { entity: 'node', types: [PERSON] },
      { entity: 'node', type: PERSON },
    ],
  ])('resolves %s', (_, value, expected) => {
    expect(resolveSubjectValue(value)).toEqual(expected);
  });

  it.each([
    [
      'a node subject listing two types',
      { entity: 'node', types: [PERSON, PLACE] },
    ],
    ['a node subject listing no types', { entity: 'node', types: [] }],
    ['a node subject listing a number', { entity: 'node', types: [1] }],
    [
      'a node subject with types as a string',
      { entity: 'node', types: PERSON },
    ],
    ['a node subject with neither field', { entity: 'node' }],
    ['an edge subject with no type', { entity: 'edge' }],
    ['an unknown entity', { entity: 'place', type: PERSON }],
    ['an array', [{ entity: 'ego' }]],
    ['null', null],
    ['a string', 'node'],
  ])('resolves %s to nothing', (_, value) => {
    expect(resolveSubjectValue(value)).toBeUndefined();
  });
});

describe('stage node type accessors', () => {
  it('read a stage listing one type', () => {
    const stage = fixtureSociogram();
    expect(getStageNodeTypes(stage)).toEqual([PERSON]);
    expect(getSingleStageNodeType(stage)).toBe(PERSON);
  });

  it('give every type of a stage listing two, and no single type', () => {
    const stage = {
      ...fixtureSociogram(),
      subject: { entity: 'node' as const, types: [PERSON, PLACE] },
    };
    expect(getStageNodeTypes(stage)).toEqual([PERSON, PLACE]);
    expect(getSingleStageNodeType(stage)).toBeUndefined();
  });

  it('give no node types for a stage with no node subject', () => {
    const protocol = ProtocolSchemaV9.parse(readFixture());
    const information = protocol.stages.find(
      (stage) => stage.type === 'Information',
    );
    if (!information) throw new Error('No Information stage');
    expect(getStageNodeTypes(information)).toEqual([]);
    expect(getSingleStageNodeType(information)).toBeUndefined();
  });
});

describe('the reference walk on a stage listing two node types', () => {
  const highlightPath = [
    'stages',
    SOCIOGRAM_INDEX,
    'prompts',
    1,
    'highlight',
    'variable',
  ].join('.');

  const highlightHit = (types: string[]) => {
    const protocol = readFixture();
    if (
      typeof protocol !== 'object' ||
      protocol === null ||
      !('stages' in protocol) ||
      !Array.isArray(protocol.stages)
    ) {
      throw new Error('The fixture has no stages');
    }
    const stage: unknown = protocol.stages[SOCIOGRAM_INDEX];
    if (typeof stage !== 'object' || stage === null) {
      throw new Error('No Sociogram stage');
    }
    Reflect.set(stage, 'subject', { entity: 'node', types });
    return collectEntityAttributeReferences(protocol).find(
      (hit) => hit.path.join('.') === highlightPath,
    );
  };

  it('resolves a stage-subject reference against the one type', () => {
    expect(highlightHit([PERSON])?.subject).toEqual({
      entity: 'node',
      type: PERSON,
    });
  });

  it('resolves a stage-subject reference to no subject', () => {
    const hit = highlightHit([PERSON, PLACE]);
    expect(hit).toBeDefined();
    expect(hit?.subject).toBeUndefined();
  });
});
