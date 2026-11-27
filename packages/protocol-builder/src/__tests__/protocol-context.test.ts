import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  entityForSubject,
  protocolContextFromSections,
  variableForSubject,
  variablesForSubject,
} from '../protocol-context.ts';
import { readMessage } from '../testing/i18n.ts';
import { testId, testTypeId, testVariableId } from '../testing/testId.ts';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const AGE = testVariableId('age');
const NICKNAME = testVariableId('nickname');
const STRENGTH = testVariableId('strength');
const CONSENTED = testVariableId('consented');
const NAME = testVariableId('name');

const FIRST_STAGE = testId('stage-first');
const SECOND_STAGE = testId('stage-second');
const MISSING_STAGE = testId('missing-stage');

const text = (value: string) => ({ 'en-US': value });

const informationStage = (id: string, label: string): SectionDoc => ({
  id,
  type: 'Information',
  label: text(label),
  content: text(label),
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
  [sectionId({ kind: 'settings' })]: {
    localization: { defaultLocale: 'en-US', locales: ['en-US'] },
  },
  [sectionId({ kind: 'stageOrder' })]: {
    stages: [SECOND_STAGE, FIRST_STAGE],
  },
  [sectionId({ kind: 'codebookNode', typeId: PERSON })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      [AGE]: { name: 'Age', type: 'number' },
      [NICKNAME]: { name: 'Nickname', type: 'text' },
    },
  },
  [sectionId({ kind: 'codebookEdge', typeId: KNOWS })]: {
    name: 'Knows',
    color: 'edge-color-seq-1',
    variables: {
      [STRENGTH]: { name: 'Strength', type: 'number' },
    },
  },
  [sectionId({ kind: 'codebookEgo' })]: {
    variables: {
      [CONSENTED]: {
        name: 'Consented',
        type: 'boolean',
      },
    },
  },
});

describe('protocolContextFromSections', () => {
  it('exposes typed codebook entities and applies the explicit stage order', () => {
    const context = protocolContextFromSections(protocolSections());

    expect(context.issues).toEqual([]);
    expect(context.localization).toEqual({
      defaultLocale: 'en-US',
      locales: ['en-US'],
    });
    expect(context.orderedStages.map(({ id }) => id)).toEqual([
      SECOND_STAGE,
      FIRST_STAGE,
    ]);
    expect(
      entityForSubject(context, { entity: 'node', type: PERSON }),
    ).toMatchObject({ name: 'Person' });
    expect(
      variablesForSubject(context, { entity: 'edge', type: KNOWS }),
    ).toHaveProperty([STRENGTH, 'name'], 'Strength');
    expect(
      variableForSubject(context, { entity: 'ego' }, CONSENTED),
    ).toMatchObject({ type: 'boolean' });
  });

  it('keeps the read model available when a referenced variable is deleted', () => {
    const sections = protocolSections();
    const nodeId = sectionId({ kind: 'codebookNode', typeId: PERSON });
    sections[nodeId] = {
      ...sections[nodeId],
      variables: {
        [NICKNAME]: { name: 'Nickname', type: 'text' },
      },
    };

    const context = protocolContextFromSections(sections);

    expect(
      variableForSubject(context, { entity: 'node', type: PERSON }, AGE),
    ).toBeUndefined();
    expect(
      variableForSubject(context, { entity: 'node', type: PERSON }, NICKNAME),
    ).toMatchObject({ name: 'Nickname' });
    expect(context.orderedStages).toHaveLength(2);
    expect(context.issues).toEqual([]);
  });

  it('reports and omits one malformed section without hiding valid siblings', () => {
    const sections = protocolSections();
    const nodeId = sectionId({ kind: 'codebookNode', typeId: PERSON });
    sections[nodeId] = { name: 'Missing appearance' };

    const context = protocolContextFromSections(sections);

    expect(
      entityForSubject(context, { entity: 'node', type: PERSON }),
    ).toBeUndefined();
    expect(
      entityForSubject(context, { entity: 'edge', type: KNOWS }),
    ).toMatchObject({ name: 'Knows' });
    expect(context.orderedStages).toHaveLength(2);
    expect(context.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ sectionId: nodeId })]),
    );
  });

  it('reports duplicate variable record ids without hiding either definition', () => {
    const sections = protocolSections();
    const edgeId = sectionId({ kind: 'codebookEdge', typeId: KNOWS });
    const egoId = sectionId({ kind: 'codebookEgo' });
    sections[edgeId] = {
      ...sections[edgeId],
      variables: {
        [AGE]: {
          name: 'RelationshipAge',
          type: 'number',
        },
      },
    };
    sections[egoId] = {
      variables: {
        [AGE]: { name: 'EgoAge', type: 'number' },
      },
    };

    const context = protocolContextFromSections(sections);

    expect(
      variableForSubject(context, { entity: 'node', type: PERSON }, AGE),
    ).toMatchObject({ name: 'Age' });
    expect(
      variableForSubject(context, { entity: 'edge', type: KNOWS }, AGE),
    ).toMatchObject({ name: 'RelationshipAge' });
    expect(variableForSubject(context, { entity: 'ego' }, AGE)).toMatchObject({
      name: 'EgoAge',
    });
    expect(
      context.issues.filter(({ message }) =>
        readMessage(message).includes(`Attribute record key "${AGE}"`),
      ),
    ).toEqual([
      expect.objectContaining({
        sectionId: edgeId,
        path: ['variables', AGE],
      }),
      expect.objectContaining({ sectionId: egoId, path: ['variables', AGE] }),
    ]);
  });

  it('reports duplicate entity names without hiding either valid definition', () => {
    const sections = protocolSections();
    const edgeId = sectionId({ kind: 'codebookEdge', typeId: KNOWS });
    sections[edgeId] = {
      ...sections[edgeId],
      name: 'Person',
    };

    const context = protocolContextFromSections(sections);

    expect(
      entityForSubject(context, { entity: 'node', type: PERSON }),
    ).toMatchObject({ name: 'Person' });
    expect(
      entityForSubject(context, { entity: 'edge', type: KNOWS }),
    ).toMatchObject({ name: 'Person' });
    expect(
      context.issues.map((issue) => ({
        ...issue,
        message: readMessage(issue.message),
      })),
    ).toContainEqual({
      sectionId: edgeId,
      path: ['name'],
      message: expect.stringContaining('Duplicate entity name "Person"'),
    });
  });

  /**
   * The stage schema states rules about a stage on its own, not only about a
   * whole protocol — an external-data panel filtered on a connection is one.
   * A stage refused by one of them is reported against its own section, with
   * the schema's own wording and its stage-relative path, and left out of the
   * read model the way any unreadable section is. The stage order is NOT also
   * accused of naming a stage that does not exist: the protocol has it, and
   * the one thing wrong with it has already been said.
   */
  it('reports a stage the stage schema refuses against that stage, not the order', () => {
    const sections = protocolSections();
    const stageSectionId = sectionId({ kind: 'stage', stageId: FIRST_STAGE });
    sections[stageSectionId] = {
      id: FIRST_STAGE,
      type: 'NameGenerator',
      label: text('First'),
      subject: { entity: 'node', type: PERSON },
      form: {
        title: text('Add'),
        content: text(fieldBlockMarkdown(testId('field-1'))),
        fields: [
          {
            id: testId('field-1'),
            variable: NAME,
            prompt: text('Name'),
          },
        ],
      },
      prompts: [{ id: testId('p1'), text: text('Who?') }],
      // The only thing this stage gets wrong is the rule.
      panels: [
        {
          id: testId('panel-1'),
          title: text('From a file'),
          dataSource: 'roster-asset',
          filter: {
            rules: [
              {
                id: testId('r1'),
                type: 'edge',
                options: { type: KNOWS, operator: 'EXISTS' },
              },
            ],
          },
        },
      ],
    };

    const context = protocolContextFromSections(sections);

    expect(
      context.issues.map((issue) => ({
        ...issue,
        message: readMessage(issue.message),
      })),
    ).toEqual([
      {
        sectionId: stageSectionId,
        path: ['panels', 0, 'filter', 'rules', 0, 'type'],
        message:
          'External-data panel filters cannot use edge rules; rules must target node attributes.',
      },
    ]);
    expect(context.orderedStages.map(({ id }) => id)).toEqual([SECOND_STAGE]);
  });

  it('reports stage-order inconsistencies instead of throwing', () => {
    const sections = protocolSections();
    sections[sectionId({ kind: 'stageOrder' })] = {
      stages: [SECOND_STAGE, MISSING_STAGE],
    };

    const context = protocolContextFromSections(sections);

    expect(context.orderedStages.map(({ id }) => id)).toEqual([SECOND_STAGE]);
    expect(context.issues.map(({ message }) => readMessage(message))).toEqual(
      expect.arrayContaining([
        `Stage order names missing stage ${MISSING_STAGE}.`,
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

  it('exposes asset metadata by id, and reports one bad entry without losing the rest', () => {
    const sections = protocolSections();
    sections[sectionId({ kind: 'assets' })] = {
      'asset-image': { name: 'A photo', type: 'image', source: 'photo.png' },
      // A file asset with no source: the kind of thing an interrupted upload
      // leaves behind. It must not cost the section its other assets.
      'asset-broken': { name: 'Half an upload', type: 'image' },
    };

    const context = protocolContextFromSections(sections);

    expect(context.assets['asset-image']).toMatchObject({ type: 'image' });
    expect(context.assets['asset-broken']).toBeUndefined();
    expect(context.issues).toContainEqual(
      expect.objectContaining({
        sectionId: sectionId({ kind: 'assets' }),
        path: ['asset-broken', 'source'],
      }),
    );
  });

  it('has no assets when the protocol has no asset section', () => {
    expect(protocolContextFromSections(protocolSections()).assets).toEqual({});
  });
});
