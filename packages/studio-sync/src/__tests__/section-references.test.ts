import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '../apply.ts';
import {
  assembledProtocol,
  entityTypeReferences,
  sweepReferences,
} from '../section-references.ts';
import { sectionId } from '../taxonomy.ts';

const PERSON = crypto.randomUUID();
const ORG = crypto.randomUUID();
const PLACE = crypto.randomUUID();
const KNOWS = crypto.randomUUID();

const nodeType = (name: string): SectionDoc => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
});

const KNOWS_SECTION = sectionId({ kind: 'codebookEdge', typeId: KNOWS });

const documentsWithRules = (
  endpointRules: { sourceType: string; targetType: string }[],
): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'settings' })]: {},
  [sectionId({ kind: 'stageOrder' })]: { stages: [] },
  [sectionId({ kind: 'codebookNode', typeId: PERSON })]: nodeType('Person'),
  [sectionId({ kind: 'codebookNode', typeId: PLACE })]: nodeType('Place'),
  [KNOWS_SECTION]: {
    name: 'Knows',
    color: 'edge-color-seq-1',
    endpointRules,
  },
});

// Deleting the Organisation node type, as a host does: its section goes, then
// the sweep removes what still names it.
const deleteOrg = (documents: Record<string, SectionDoc>) =>
  sweepReferences(documents, (current) =>
    entityTypeReferences(assembledProtocol(current), 'node', ORG),
  );

describe('reference sweep', () => {
  it.each([
    {
      name: 'the only rule',
      rules: [{ sourceType: ORG, targetType: PERSON }],
    },
    {
      name: 'one of several rules',
      rules: [
        { sourceType: PERSON, targetType: PLACE },
        { sourceType: ORG, targetType: PERSON },
      ],
    },
  ])(
    'leaves an endpoint rule naming the deleted node type when it is $name',
    ({ rules }) => {
      const documents = documentsWithRules(rules);
      const ruleIndex = rules.findIndex(({ sourceType }) => sourceType === ORG);

      const { rewritten, remaining } = deleteOrg(documents);

      expect(rewritten.size).toBe(0);
      expect(remaining).toEqual([
        {
          sectionId: KNOWS_SECTION,
          path: ['endpointRules', ruleIndex, 'sourceType'],
        },
      ]);
      expect(documents[KNOWS_SECTION]?.endpointRules).toEqual(rules);
    },
  );
});

describe('stage subject references', () => {
  const PEOPLE = crypto.randomUUID();
  const PLACES = crypto.randomUUID();
  const nameGenerator = (types: string[]): SectionDoc => ({
    type: 'NameGenerator',
    label: { en: 'Names' },
    subject: { entity: 'node', types },
    form: { fields: [] },
    prompts: [{ id: crypto.randomUUID(), text: { en: 'Who?' } }],
  });
  const documents: Record<string, SectionDoc> = {
    [sectionId({ kind: 'settings' })]: {},
    [sectionId({ kind: 'stageOrder' })]: { stages: [PEOPLE, PLACES] },
    [sectionId({ kind: 'codebookNode', typeId: PERSON })]: nodeType('Person'),
    [sectionId({ kind: 'codebookNode', typeId: PLACE })]: nodeType('Place'),
    [sectionId({ kind: 'stage', stageId: PEOPLE })]: nameGenerator([PERSON]),
    [sectionId({ kind: 'stage', stageId: PLACES })]: nameGenerator([PLACE]),
  };
  const referencesTo = (typeId: string) =>
    entityTypeReferences(assembledProtocol(documents), 'node', typeId);

  it("a node type in a stage's types list is a reference to that type only", () => {
    expect(referencesTo(PERSON)).toEqual([
      {
        sectionId: sectionId({ kind: 'stage', stageId: PEOPLE }),
        path: ['subject', 'types', 0],
      },
    ]);
    expect(referencesTo(PLACE)).toEqual([
      {
        sectionId: sectionId({ kind: 'stage', stageId: PLACES }),
        path: ['subject', 'types', 0],
      },
    ]);
    expect(referencesTo(ORG)).toEqual([]);
  });
});

describe('deleting a node type that a stage is about', () => {
  const STAGE = crypto.randomUUID();
  const STAGE_SECTION = sectionId({ kind: 'stage', stageId: STAGE });
  const VARIABLE = crypto.randomUUID();
  const documentsWith = (stage: SectionDoc): Record<string, SectionDoc> => ({
    [sectionId({ kind: 'settings' })]: {},
    [sectionId({ kind: 'stageOrder' })]: { stages: [STAGE] },
    [sectionId({ kind: 'codebookNode', typeId: PLACE })]: nodeType('Place'),
    [STAGE_SECTION]: stage,
  });

  it('leaves a stage whose only type it is, and reports the stage', () => {
    const stage: SectionDoc = {
      id: STAGE,
      type: 'NameGenerator',
      label: { en: 'Names' },
      subject: { entity: 'node', types: [ORG] },
      form: {
        title: { en: 'About them' },
        fields: [
          {
            id: crypto.randomUUID(),
            variable: VARIABLE,
            prompt: { en: 'Name' },
          },
        ],
      },
      prompts: [{ id: crypto.randomUUID(), text: { en: 'Who?' } }],
    };
    const documents = documentsWith(stage);
    const before = structuredClone(stage);

    const { rewritten, remaining } = deleteOrg(documents);

    expect(rewritten.size).toBe(0);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { sectionId: STAGE_SECTION, path: ['subject', 'types', 0] },
        { sectionId: STAGE_SECTION, path: ['form', 'fields', 0, 'variable'] },
      ]),
    );
    expect(documents[STAGE_SECTION]).toEqual(before);
  });

  // A stage that lists several types resolves its stage-subject references
  // against none of them, and validation refuses any such reference there
  // (see multi-type-stage-references.test.ts in protocol-validation), so
  // dropping the deleted type from the list leaves nothing naming it.
  it('drops it from a stage that lists other types too', () => {
    const documents = documentsWith({
      id: STAGE,
      type: 'DyadCensus',
      label: { en: 'Pairs' },
      subject: { entity: 'node', types: [ORG, PLACE] },
      prompts: [
        {
          id: crypto.randomUUID(),
          text: { en: 'Do they know each other?' },
          createEdge: KNOWS,
        },
      ],
    });

    const { rewritten, remaining } = deleteOrg(documents);

    expect(remaining).toEqual([]);
    expect(rewritten.get(STAGE_SECTION)?.subject).toEqual({
      entity: 'node',
      types: [PLACE],
    });
  });
});
