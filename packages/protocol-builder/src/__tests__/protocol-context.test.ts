import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  entityForSubject,
  protocolContextFromSections,
  variableForSubject,
  variablesForSubject,
} from '../protocol-context.ts';

const FIRST_STAGE = 'stage-first';
const SECOND_STAGE = 'stage-second';

const informationStage = (id: string, label: string): SectionDoc => ({
  id,
  type: 'Information',
  label,
  title: label,
  items: [],
});

const protocolSections = (): Record<string, SectionDoc> => ({
  // Deliberately inserted in the opposite order to `stageOrder`.
  [sectionId({ kind: 'stage', stageId: FIRST_STAGE })]: informationStage(
    FIRST_STAGE,
    'First',
  ),
  [sectionId({ kind: 'stage', stageId: SECOND_STAGE })]: informationStage(
    SECOND_STAGE,
    'Second',
  ),
  [sectionId({ kind: 'stageOrder' })]: {
    stages: [SECOND_STAGE, FIRST_STAGE],
  },
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      age: { name: 'Age', type: 'number' },
      nickname: { name: 'Nickname', type: 'text' },
    },
  },
  [sectionId({ kind: 'codebookEdge', typeId: 'knows' })]: {
    name: 'Knows',
    color: 'edge-color-seq-1',
    variables: {
      strength: { name: 'Strength', type: 'number' },
    },
  },
  [sectionId({ kind: 'codebookEgo' })]: {
    variables: {
      consented: { name: 'Consented', type: 'boolean' },
    },
  },
});

describe('protocolContextFromSections', () => {
  it('exposes typed codebook entities and applies the explicit stage order', () => {
    const context = protocolContextFromSections(protocolSections());

    expect(context.issues).toEqual([]);
    expect(context.orderedStages.map(({ id }) => id)).toEqual([
      SECOND_STAGE,
      FIRST_STAGE,
    ]);
    expect(
      entityForSubject(context, { entity: 'node', type: 'person' }),
    ).toMatchObject({ name: 'Person' });
    expect(
      variablesForSubject(context, { entity: 'edge', type: 'knows' }),
    ).toHaveProperty('strength.name', 'Strength');
    expect(
      variableForSubject(context, { entity: 'ego' }, 'consented'),
    ).toMatchObject({ type: 'boolean' });
  });

  it('keeps the read model available when a referenced variable is deleted', () => {
    const sections = protocolSections();
    const nodeId = sectionId({ kind: 'codebookNode', typeId: 'person' });
    sections[nodeId] = {
      ...sections[nodeId],
      variables: {
        nickname: { name: 'Nickname', type: 'text' },
      },
    };

    const context = protocolContextFromSections(sections);

    expect(
      variableForSubject(context, { entity: 'node', type: 'person' }, 'age'),
    ).toBeUndefined();
    expect(
      variableForSubject(
        context,
        { entity: 'node', type: 'person' },
        'nickname',
      ),
    ).toMatchObject({ name: 'Nickname' });
    expect(context.orderedStages).toHaveLength(2);
    expect(context.issues).toEqual([]);
  });

  it('reports and omits one malformed section without hiding valid siblings', () => {
    const sections = protocolSections();
    const nodeId = sectionId({ kind: 'codebookNode', typeId: 'person' });
    sections[nodeId] = { name: 'Missing appearance' };

    const context = protocolContextFromSections(sections);

    expect(
      entityForSubject(context, { entity: 'node', type: 'person' }),
    ).toBeUndefined();
    expect(
      entityForSubject(context, { entity: 'edge', type: 'knows' }),
    ).toMatchObject({ name: 'Knows' });
    expect(context.orderedStages).toHaveLength(2);
    expect(context.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ sectionId: nodeId })]),
    );
  });

  it('reports duplicate variable record ids without hiding either definition', () => {
    const sections = protocolSections();
    const edgeId = sectionId({ kind: 'codebookEdge', typeId: 'knows' });
    const egoId = sectionId({ kind: 'codebookEgo' });
    sections[edgeId] = {
      ...sections[edgeId],
      variables: {
        age: { name: 'RelationshipAge', type: 'number' },
      },
    };
    sections[egoId] = {
      variables: {
        age: { name: 'EgoAge', type: 'number' },
      },
    };

    const context = protocolContextFromSections(sections);

    expect(
      variableForSubject(context, { entity: 'node', type: 'person' }, 'age'),
    ).toMatchObject({ name: 'Age' });
    expect(
      variableForSubject(context, { entity: 'edge', type: 'knows' }, 'age'),
    ).toMatchObject({ name: 'RelationshipAge' });
    expect(variableForSubject(context, { entity: 'ego' }, 'age')).toMatchObject(
      { name: 'EgoAge' },
    );
    expect(
      context.issues.filter(({ message }) =>
        message.includes('Attribute record key "age"'),
      ),
    ).toEqual([
      expect.objectContaining({
        sectionId: edgeId,
        path: ['variables', 'age'],
      }),
      expect.objectContaining({ sectionId: egoId, path: ['variables', 'age'] }),
    ]);
  });

  it('reports duplicate entity names without hiding either valid definition', () => {
    const sections = protocolSections();
    const edgeId = sectionId({ kind: 'codebookEdge', typeId: 'knows' });
    sections[edgeId] = {
      ...sections[edgeId],
      name: 'Person',
    };

    const context = protocolContextFromSections(sections);

    expect(
      entityForSubject(context, { entity: 'node', type: 'person' }),
    ).toMatchObject({ name: 'Person' });
    expect(
      entityForSubject(context, { entity: 'edge', type: 'knows' }),
    ).toMatchObject({ name: 'Person' });
    expect(context.issues).toContainEqual({
      sectionId: edgeId,
      path: ['name'],
      message: expect.stringContaining('Duplicate entity name "Person"'),
    });
  });

  it('reports stage-order inconsistencies instead of throwing', () => {
    const sections = protocolSections();
    sections[sectionId({ kind: 'stageOrder' })] = {
      stages: [SECOND_STAGE, 'missing-stage'],
    };

    const context = protocolContextFromSections(sections);

    expect(context.orderedStages.map(({ id }) => id)).toEqual([SECOND_STAGE]);
    expect(context.issues.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        'Stage order names missing stage missing-stage.',
        `Stage ${FIRST_STAGE} is missing from the stage order.`,
      ]),
    );
  });

  it('preserves a schema-valid __proto__ entity id as ordinary data', () => {
    const sections = protocolSections();
    sections[sectionId({ kind: 'codebookNode', typeId: '__proto__' })] = {
      name: 'Prototype',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
    };

    const context = protocolContextFromSections(sections);

    expect(Object.hasOwn(context.codebook.node ?? {}, '__proto__')).toBe(true);
    expect(
      entityForSubject(context, { entity: 'node', type: '__proto__' }),
    ).toMatchObject({ name: 'Prototype' });
  });
});
