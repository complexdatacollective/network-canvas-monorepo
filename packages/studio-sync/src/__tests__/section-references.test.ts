import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '../apply.ts';
import {
  assembledProtocol,
  entityTypeReferences,
  layoutReferences,
  sectionReferenceAt,
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

describe('deleting a layout', () => {
  const SEATING = crypto.randomUUID();
  const NAMES = crypto.randomUUID();
  const STORY = crypto.randomUUID();
  const NAMES_SECTION = sectionId({ kind: 'stage', stageId: NAMES });
  const STORY_SECTION = sectionId({ kind: 'stage', stageId: STORY });
  const PLACED = crypto.randomUUID();
  const NAMED = crypto.randomUUID();

  const nameGenerator: SectionDoc = {
    id: NAMES,
    type: 'NameGenerator',
    label: { en: 'Names' },
    subject: { entity: 'node', types: [PERSON] },
    form: {
      title: { en: 'About them' },
      fields: [
        {
          id: crypto.randomUUID(),
          variable: crypto.randomUUID(),
          prompt: { en: 'Name' },
        },
      ],
    },
    prompts: [{ id: crypto.randomUUID(), text: { en: 'Who?' } }],
    skipLogic: {
      action: 'SKIP',
      filter: {
        join: 'OR',
        rules: [
          {
            id: PLACED,
            type: 'node',
            options: { type: PERSON, attribute: SEATING, operator: 'EXISTS' },
          },
          {
            id: NAMED,
            type: 'node',
            options: { type: PERSON, operator: 'EXISTS' },
          },
        ],
      },
    },
  };

  const narrative: SectionDoc = {
    id: STORY,
    type: 'Narrative',
    label: { en: 'Story' },
    subject: { entity: 'node', types: [PERSON] },
    background: { concentricCircles: 4 },
    presets: [
      { id: crypto.randomUUID(), label: { en: 'Seats' }, layout: SEATING },
    ],
  };

  // The layout's section is gone, as a host removes it before asking what
  // still names it.
  const documentsWith = (
    stages: Record<string, SectionDoc>,
  ): Record<string, SectionDoc> => ({
    [sectionId({ kind: 'settings' })]: {},
    [sectionId({ kind: 'stageOrder' })]: {
      stages: Object.values(stages).map(({ id }) => id),
    },
    [sectionId({ kind: 'codebookNode', typeId: PERSON })]: nodeType('Person'),
    ...stages,
  });

  const ruleIds = (documents: Record<string, SectionDoc>) => {
    const rules: unknown = Reflect.get(
      Reflect.get(
        Reflect.get(documents[NAMES_SECTION] ?? {}, 'skipLogic') ?? {},
        'filter',
      ) ?? {},
      'rules',
    );
    return Array.isArray(rules)
      ? rules.map((rule: unknown) =>
          typeof rule === 'object' && rule !== null
            ? Reflect.get(rule, 'id')
            : undefined,
        )
      : [];
  };

  it('deleting a layout removes a filter rule that names it', () => {
    const documents = documentsWith({ [NAMES_SECTION]: nameGenerator });

    expect(
      layoutReferences(assembledProtocol(documents), SEATING).stages,
    ).toEqual([]);
    const { rewritten, remaining } = sweepReferences(
      documents,
      (current) => layoutReferences(assembledProtocol(current), SEATING).rules,
    );

    expect(remaining).toEqual([]);
    expect([...rewritten.keys()]).toEqual([NAMES_SECTION]);
    expect(ruleIds(documents)).toEqual([NAMED]);
  });

  it('refuses deleting a layout a Narrative preset names and keeps the preset', () => {
    const documents = documentsWith({ [STORY_SECTION]: narrative });

    const { stages, rules } = layoutReferences(
      assembledProtocol(documents),
      SEATING,
    );

    expect(stages).toEqual([
      { sectionId: STORY_SECTION, path: ['presets', 0, 'layout'] },
    ]);
    // A preset is an entry of its list, so only asking for the stage
    // references first keeps the sweep from dropping it.
    expect(rules).toEqual([]);
    expect(documents[STORY_SECTION]).toEqual(narrative);
  });

  it('a layout named by a stage and by a filter rule is refused and the rule is kept', () => {
    const documents = documentsWith({
      [NAMES_SECTION]: nameGenerator,
      [STORY_SECTION]: narrative,
    });

    const { stages, rules } = layoutReferences(
      assembledProtocol(documents),
      SEATING,
    );

    expect(stages).toEqual([
      { sectionId: STORY_SECTION, path: ['presets', 0, 'layout'] },
    ]);
    expect(rules).toEqual([
      {
        sectionId: NAMES_SECTION,
        path: ['skipLogic', 'filter', 'rules', 0, 'options', 'attribute'],
      },
    ]);
    expect(ruleIds(documents)).toEqual([PLACED, NAMED]);
  });

  it('routes a path under codebook.layouts to the layout’s section', () => {
    expect(
      sectionReferenceAt(['codebook', 'layouts', SEATING, 'name'], []),
    ).toEqual({
      sectionId: sectionId({ kind: 'codebookLayout', layoutId: SEATING }),
      path: ['name'],
    });
  });
});
