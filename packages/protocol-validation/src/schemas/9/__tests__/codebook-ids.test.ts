import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  testId,
  testTypeId,
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import { valueAt } from '../../../utils/protocolObjectIdRewrite.ts';
import {
  isAttributeHit,
  isTypeHit,
  walkSchemaReferences,
} from '../../../utils/schemaReferenceWalk.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import {
  createEntityTypeId,
  createVariableId,
  deterministicVariableId,
  isEntityTypeId,
  isVariableId,
} from '../codebook-ids.ts';
import {
  dynamicValueNameFor,
  dynamicValueReferencesIn,
  parseDynamicValueName,
} from '../dynamic-values.ts';
import { renameCodebookIds } from '../migration-codebook-ids.ts';
import migrationV8toV9 from '../migration.ts';
import { ProtocolStructureSchema } from '../protocol-structure.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type Path = (string | number)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordAt = (root: unknown, path: Path): Record<string, unknown> => {
  const value = valueAt(root, path);
  if (!isRecord(value)) throw new Error(`No record at ${path.join('.')}`);
  return value;
};

const arrayAt = (root: unknown, path: Path): unknown[] => {
  const value = valueAt(root, path);
  if (!Array.isArray(value)) throw new Error(`No list at ${path.join('.')}`);
  return value;
};

const stageNamed = (protocol: unknown, id: string) => {
  const stage = arrayAt(protocol, ['stages']).find(
    (candidate) => isRecord(candidate) && candidate.id === id,
  );
  if (!isRecord(stage)) throw new Error(`No stage ${id}`);
  return stage;
};

const stageOfType = (protocol: unknown, type: string) => {
  const stage = arrayAt(protocol, ['stages']).find(
    (candidate) => isRecord(candidate) && candidate.type === type,
  );
  if (!isRecord(stage)) throw new Error(`No ${type} stage`);
  return stage;
};

const issuesOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({
        path: path.map(String),
        message,
      }));
};

describe('codebook ids', () => {
  it('are UUIDs, made at random or from a label', () => {
    expect(isVariableId(createVariableId())).toBe(true);
    expect(isEntityTypeId(createEntityTypeId())).toBe(true);
    expect(createVariableId()).not.toBe(createVariableId());
    const fromLabel = deterministicVariableId(
      '0f6a3c3e-6d55-4a52-8b5e-7a1c0e6f2d11',
    );
    expect(fromLabel('age')).toBe(fromLabel('age'));
    expect(fromLabel('age')).not.toBe(fromLabel('name'));
    expect(isVariableId(fromLabel('age'))).toBe(true);
    expect(isVariableId('age')).toBe(false);
  });
});

describe('a schema 9 codebook', () => {
  const valid = () => withFinishStage(createBaseProtocol());

  it('accepts UUID keys', () => {
    expect(issuesOf(valid())).toEqual([]);
  });

  it.each([
    {
      what: 'a node variable',
      at: (protocol: ReturnType<typeof valid>) =>
        recordAt(protocol, [
          'codebook',
          'node',
          testTypeId('person'),
          'variables',
        ]),
      path: ['codebook', 'node', testTypeId('person'), 'variables', 'age 2'],
      message:
        'The variable id "age 2" is not a UUID. Every variable id must be a UUID.',
    },
    {
      what: 'an edge variable',
      at: (protocol: ReturnType<typeof valid>) =>
        recordAt(protocol, ['codebook', 'edge', testTypeId('knows')]),
      variables: true,
      path: ['codebook', 'edge', testTypeId('knows'), 'variables', 'age 2'],
      message:
        'The variable id "age 2" is not a UUID. Every variable id must be a UUID.',
    },
    {
      what: 'an ego variable',
      at: (protocol: ReturnType<typeof valid>) =>
        recordAt(protocol, ['codebook', 'ego', 'variables']),
      path: ['codebook', 'ego', 'variables', 'age 2'],
      message:
        'The variable id "age 2" is not a UUID. Every variable id must be a UUID.',
    },
  ])(
    'refuses $what key that is not a UUID',
    ({ at, variables, path, message }) => {
      const protocol = valid();
      const record = at(protocol);
      const target = variables === true ? (record.variables ??= {}) : record;
      if (!isRecord(target)) throw new Error('No variables');
      target['age 2'] = { name: 'Age2', type: 'number' };
      expect(issuesOf(protocol)).toEqual([{ path, message }]);
    },
  );

  it.each(['node', 'edge'] as const)(
    'refuses a %s type key that is not a UUID',
    (entity) => {
      const protocol = valid();
      recordAt(protocol, ['codebook', entity]).thing = {
        name: 'Thing',
        color: entity === 'node' ? 'node-color-seq-4' : 'edge-color-seq-4',
        ...(entity === 'node' ? { shape: { default: 'circle' } } : {}),
      };
      expect(issuesOf(protocol)).toEqual([
        {
          path: ['codebook', entity, 'thing'],
          message: `The ${entity} type id "thing" is not a UUID. Every ${entity} type id must be a UUID.`,
        },
      ]);
    },
  );

  it('still refuses a reference to a variable it does not hold', () => {
    const protocol = valid();
    const field = valueAt(protocol, ['stages', 0, 'form', 'fields', 0]);
    if (!isRecord(field)) throw new Error('No field');
    const missing = testVariableId('missing');
    field.variable = missing;
    expect(issuesOf(protocol)).toContainEqual(
      expect.objectContaining({
        path: ['stages', '0', 'form', 'fields', '0', 'variable'],
        message: expect.stringContaining(missing),
      }),
    );
  });
});

/**
 * The complete fixture, written with readable keys, with a reference of
 * every kind the fixture lacks added, so that it holds a reference at every
 * place the schema tags.
 */
const withEveryReference = () => {
  const protocol = completeProtocol();
  const person = recordAt(protocol, ['codebook', 'node', 'person']);
  person.shape = {
    default: 'circle',
    dynamic: {
      variable: 'flag',
      type: 'discrete',
      map: [{ value: true, shape: 'square' }],
    },
  };
  // Text names an attribute by the id `withTestCodebookIds` gives its
  // readable key.
  const nickname = dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: testVariableId('nickname'),
  });
  person.dynamicLabel = {
    text: {
      en: `{${nickname}, select, missing {Someone} other {{${nickname}}}}`,
    },
  };

  const nameGenerator = stageNamed(protocol, 'nameGenerator');
  nameGenerator.skipLogic = {
    action: 'SHOW',
    filter: {
      join: 'AND',
      rules: [
        {
          id: testId('rule-node'),
          type: 'node',
          options: {
            type: 'person',
            attribute: 'nickname',
            operator: 'EXISTS',
          },
        },
        {
          id: testId('rule-edge'),
          type: 'edge',
          options: { type: 'knows', attribute: 'note', operator: 'EXISTS' },
        },
        {
          id: testId('rule-ego'),
          type: 'ego',
          options: { attribute: 'egoAge', operator: 'EXISTS' },
        },
      ],
    },
  };
  nameGenerator.conditions = {
    [testId('condition')]: {
      about: 'node',
      join: 'OR',
      rules: [
        {
          id: testId('condition-edges'),
          type: 'edge',
          options: { type: 'knows', count: 'MOST' },
        },
        {
          id: testId('condition-node'),
          type: 'node',
          options: { type: 'person', attribute: 'flag', operator: 'EXISTS' },
        },
      ],
    },
  };
  const [panel] = arrayAt(nameGenerator, ['panels']);
  if (isRecord(panel)) {
    panel.filter = {
      rules: [
        {
          id: testId('rule-panel'),
          type: 'node',
          options: { type: 'person', attribute: 'name', operator: 'EXISTS' },
        },
      ],
    };
  }
  const [prompt] = arrayAt(nameGenerator, ['prompts']);
  if (isRecord(prompt)) {
    const egoName = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('egoName'),
    });
    prompt.text = {
      en: `Who does {${egoName}, select, missing {the participant} other {{${egoName}}}} know?`,
    };
    prompt.additionalAttributes = [
      { id: testId('additional'), variable: 'flag', value: true },
    ];
  }

  const sociogram = stageNamed(protocol, 'sociogram');
  const [sociogramPrompt] = arrayAt(sociogram, ['prompts']);
  if (isRecord(sociogramPrompt)) {
    sociogramPrompt.sortOrder = [{ property: 'name', direction: 'asc' }];
    sociogramPrompt.highlight = { allowHighlighting: true, variable: 'flag' };
    sociogramPrompt.edges = { display: ['knows'], create: 'knows' };
  }

  const roster = stageNamed(protocol, 'roster');
  recordAt(roster, ['sortOptions']).sortOrder = [
    { property: '*', direction: 'desc' },
    { property: 'name', direction: 'asc' },
  ];
  return protocol;
};

type Kind = string;

// A reference's place with its indices and codebook keys left out, the
// stage type it is on, and whether it is a type (T), an attribute (A), a
// column of a roster's data (D) or an attribute text names ($).
const kindOf = (protocol: unknown, path: Path, flag: string): Kind => {
  const stage = path[0] === 'stages' ? valueAt(protocol, path.slice(0, 2)) : 0;
  const stageType =
    isRecord(stage) && typeof stage.type === 'string' ? `${stage.type} ` : '';
  const place = path
    .map((segment, index) =>
      typeof segment === 'number'
        ? '#'
        : path[0] === 'codebook' &&
            ['node', 'edge', 'variables', 'conditions'].includes(
              String(path[index - 1]),
            )
          ? '*'
          : path[index - 1] === 'conditions'
            ? '*'
            : segment,
    )
    .join('.');
  return `${flag} ${stageType}${place}`;
};

// Every place a node or edge type, or a variable, is referred to, as
// `kindOf` names them.
const EVERY_REFERENCE_KIND = [
  'A $ NameGenerator stages.#.prompts.#.text.en',
  'A AlterEdgeForm stages.#.form.fields.#.variable',
  'A AlterForm stages.#.form.fields.#.variable',
  'A CategoricalBin stages.#.prompts.#.otherVariable',
  'A CategoricalBin stages.#.prompts.#.variable',
  'A EgoForm stages.#.form.fields.#.variable',
  'A FamilyPedigree stages.#.completeness.relativesNotRecordedAttribute',
  'A FamilyPedigree stages.#.edgeConfiguration.currentPartnerAttribute',
  'A FamilyPedigree stages.#.edgeConfiguration.gestationalCarrierAttribute',
  'A FamilyPedigree stages.#.edgeConfiguration.kindAttribute',
  'A FamilyPedigree stages.#.form.fields.#.variable',
  'A FamilyPedigree stages.#.nodeConfiguration.egoAttribute',
  'A FamilyPedigree stages.#.nodeConfiguration.nameAttribute',
  'A FamilyPedigree stages.#.nodeConfiguration.sexAssignedAtBirthAttribute',
  'A FamilyPedigree stages.#.nominationPrompts.#.attribute',
  'A Geospatial stages.#.prompts.#.variable',
  'A NameGenerator stages.#.conditions.*.rules.#.options.attribute',
  'A NameGenerator stages.#.form.fields.#.variable',
  'A NameGenerator stages.#.panels.#.filter.rules.#.options.attribute',
  'A NameGenerator stages.#.prompts.#.additionalAttributes.#.variable',
  'A NameGenerator stages.#.skipLogic.filter.rules.#.options.attribute',
  'A NameGeneratorQuickAdd stages.#.quickAdd',
  'A Narrative stages.#.presets.#.groupVariable',
  'A Narrative stages.#.presets.#.highlight.#.variable',
  'A Narrative stages.#.presets.#.layoutVariable',
  'A NarrativePedigree stages.#.diseases.#.attribute',
  'A NetworkComposer stages.#.convexHullVariable',
  'A NetworkComposer stages.#.edges.#.form.fields.#.variable',
  'A NetworkComposer stages.#.layoutVariable',
  'A NetworkComposer stages.#.nodeForm.fields.#.variable',
  'A NetworkComposer stages.#.quickAdd',
  'A OrdinalBin stages.#.prompts.#.variable',
  'A Sociogram stages.#.prompts.#.highlight.variable',
  'A Sociogram stages.#.prompts.#.layout.layoutVariable',
  'A Sociogram stages.#.prompts.#.sortOrder.#.property',
  'A TieStrengthCensus stages.#.prompts.#.edgeVariable',
  'A $ codebook.node.*.dynamicLabel.text.en',
  'A codebook.ego.variables.*.validation.differentFrom',
  'A codebook.ego.variables.*.validation.greaterThanOrEqualToVariable',
  'A codebook.ego.variables.*.validation.greaterThanVariable',
  'A codebook.ego.variables.*.validation.lessThanOrEqualToVariable',
  'A codebook.ego.variables.*.validation.lessThanVariable',
  'A codebook.ego.variables.*.validation.sameAs',
  'A codebook.node.*.shape.dynamic.variable',
  'D NameGeneratorRoster stages.#.cardOptions.additionalProperties.#.variable',
  'D NameGeneratorRoster stages.#.searchOptions.matchProperties.#',
  'D NameGeneratorRoster stages.#.sortOptions.sortableProperties.#.variable',
  'D NameGeneratorRoster stages.#.sortOptions.sortOrder.#.property',
  'T AlterEdgeForm stages.#.subject.type',
  'T AlterForm stages.#.subject.types.#',
  'T CategoricalBin stages.#.subject.types.#',
  'T DyadCensus stages.#.prompts.#.createEdge',
  'T DyadCensus stages.#.subject.types.#',
  'T FamilyPedigree stages.#.edgeConfiguration.type',
  'T FamilyPedigree stages.#.subject.types.#',
  'T Geospatial stages.#.subject.types.#',
  'T NameGenerator stages.#.conditions.*.rules.#.options.type',
  'T NameGenerator stages.#.panels.#.filter.rules.#.options.type',
  'T NameGenerator stages.#.skipLogic.filter.rules.#.options.type',
  'T NameGenerator stages.#.subject.types.#',
  'T NameGeneratorQuickAdd stages.#.subject.types.#',
  'T NameGeneratorRoster stages.#.subject.types.#',
  'T Narrative stages.#.presets.#.edges.display.#.type',
  'T Narrative stages.#.subject.types.#',
  'T NetworkComposer stages.#.edges.#.subject.type',
  'T NetworkComposer stages.#.subject.types.#',
  'T OneToManyDyadCensus stages.#.prompts.#.createEdge',
  'T OneToManyDyadCensus stages.#.subject.types.#',
  'T OrdinalBin stages.#.subject.types.#',
  'T Sociogram stages.#.prompts.#.edges.create',
  'T Sociogram stages.#.prompts.#.edges.display.#',
  'T Sociogram stages.#.subject.types.#',
  'T TieStrengthCensus stages.#.prompts.#.createEdge',
  'T TieStrengthCensus stages.#.subject.types.#',
];

type Reference = {
  kind: Kind;
  path: Path;
  held: string;
  entity: 'node' | 'edge' | undefined;
  /** The name text uses for the attribute, for an attribute text names. */
  inMessage: string | undefined;
  dataSourceColumn: boolean;
};

const referencesIn = (protocol: Record<string, unknown>): Reference[] =>
  [...walkSchemaReferences(ProtocolStructureSchema, protocol)].flatMap(
    (hit): Reference[] => {
      if (isTypeHit(hit)) {
        return [
          {
            kind: kindOf(protocol, hit.path, 'T'),
            path: hit.path,
            held: hit.typeId,
            entity: hit.entity,
            inMessage: undefined,
            dataSourceColumn: false,
          },
        ];
      }
      if (!isAttributeHit(hit)) return [];
      const flag = hit.dataSourceColumn ? 'D' : hit.inMessage ? 'A $' : 'A';
      return [
        {
          kind: kindOf(protocol, hit.path, flag),
          path: hit.path,
          held: hit.variableId,
          entity: undefined,
          inMessage: hit.inMessage?.name,
          dataSourceColumn: hit.dataSourceColumn === true,
        },
      ];
    },
  );

// The owner of each variable key, in a codebook whose variable keys are
// unique across it.
const ownerOfVariable = (protocol: unknown) => {
  const owners = new Map<string, string>();
  const codebook = recordAt(protocol, ['codebook']);
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const [type, definition] of Object.entries(types)) {
      if (!isRecord(definition) || !isRecord(definition.variables)) continue;
      for (const key of Object.keys(definition.variables)) {
        owners.set(key, `${entity}/${type}`);
      }
    }
  }
  for (const key of Object.keys(
    recordAt(protocol, ['codebook', 'ego', 'variables']),
  )) {
    owners.set(key, 'ego');
  }
  return owners;
};

describe('renaming codebook ids', () => {
  it('finds a reference at every place the schema tags', () => {
    const kinds = new Set(
      referencesIn(withEveryReference()).map(({ kind }) => kind),
    );
    const byText = (a: string, b: string) => a.localeCompare(b);
    expect([...kinds].toSorted(byText)).toEqual(
      EVERY_REFERENCE_KIND.toSorted(byText),
    );
  });

  // Schema 9 text can name only an attribute whose key is a UUID, so only
  // the codebook keyed by them shows that text follows a rename.
  it.each([
    ['readable keys', withEveryReference, 0],
    [
      'UUID keys',
      () => withTestCodebookIds(withEveryReference()),
      // The node label's and the prompt's.
      2,
    ],
  ])(
    'points every reference at the new id of what it names, in a codebook with %s',
    (_, fixture, namedInText) => {
      const original = fixture();
      const owners = ownerOfVariable(original);
      const newTypeId = (type: string, entity: string) =>
        testTypeId(`new ${entity}/${type}`);
      const newVariableId = (key: string, owner: string) =>
        testVariableId(`new ${owner}/${key}`);

      const renamed = structuredClone(original);
      renameCodebookIds(renamed, {
        typeId: newTypeId,
        variableId: (key, owner) =>
          newVariableId(
            key,
            owner.entity === 'ego' ? 'ego' : `${owner.entity}/${owner.type}`,
          ),
      });

      // A place inside the codebook moves with the keys it passes through.
      const renamedPath = (path: Path): Path => {
        const [root, entity, type, record, key, ...rest] = path;
        if (root !== 'codebook') return path;
        if (
          entity === 'ego' &&
          type === 'variables' &&
          typeof record === 'string'
        ) {
          return [
            root,
            entity,
            type,
            newVariableId(record, 'ego'),
            ...path.slice(4),
          ];
        }
        if (
          (entity !== 'node' && entity !== 'edge') ||
          typeof type !== 'string'
        ) {
          return path;
        }
        const owner = `${entity}/${type}`;
        return record === 'variables' && typeof key === 'string'
          ? [
              root,
              entity,
              newTypeId(type, entity),
              record,
              newVariableId(key, owner),
              ...rest,
            ]
          : [root, entity, newTypeId(type, entity), ...path.slice(3)];
      };

      const references = referencesIn(original);
      expect(references.length).toBeGreaterThan(0);
      let renamedInText = 0;
      for (const reference of references) {
        const now = valueAt(renamed, renamedPath(reference.path));
        if (reference.entity !== undefined) {
          expect({ at: reference.kind, now }).toEqual({
            at: reference.kind,
            now: newTypeId(reference.held, reference.entity),
          });
          continue;
        }
        const owner = owners.get(reference.held);
        if (reference.dataSourceColumn || owner === undefined) {
          expect({ at: reference.kind, now }).toEqual({
            at: reference.kind,
            now: valueAt(original, reference.path),
          });
          continue;
        }
        const newId = newVariableId(reference.held, owner);
        if (reference.inMessage === undefined) {
          expect({ at: reference.kind, now }).toEqual({
            at: reference.kind,
            now: newId,
          });
          continue;
        }
        // Text names the attribute by its new id, and no longer by its old.
        const parsed = parseDynamicValueName(reference.inMessage);
        if (parsed?.kind !== 'attribute') throw new Error('Not an attribute');
        const names = dynamicValueReferencesIn(String(now)).map(
          ({ name }) => name,
        );
        expect({ at: reference.kind, names }).toEqual({
          at: reference.kind,
          names: expect.arrayContaining([
            dynamicValueNameFor({ ...parsed, variableId: newId }),
          ]),
        });
        expect(names).not.toContain(reference.inMessage);
        renamedInText += 1;
      }
      expect(renamedInText).toBe(namedInText);
    },
  );

  it('leaves the nomination-order sort key and the roster columns as they are', () => {
    const renamed = withTestCodebookIds(withEveryReference());
    const roster = stageNamed(renamed, 'roster');
    expect(valueAt(roster, ['sortOptions', 'sortOrder'])).toEqual([
      { property: '*', direction: 'desc' },
      { property: 'name', direction: 'asc' },
    ]);
    expect(valueAt(roster, ['searchOptions', 'matchProperties'])).toEqual([
      'name',
    ]);
    expect(
      valueAt(roster, ['cardOptions', 'additionalProperties', 0, 'variable']),
    ).toBe('name');
  });

  it('gives one key on two entities an id for each, and each reference the id of its own', () => {
    const protocol = {
      codebook: {
        node: {
          person: { name: 'Person', variables: { name: { name: 'Name' } } },
          place: { name: 'Place', variables: { name: { name: 'Name' } } },
        },
        edge: { knows: { name: 'Knows', variables: { name: { name: 'N' } } } },
        ego: { variables: { name: { name: 'Name' } } },
      },
      stages: [
        {
          id: 'people',
          type: 'AlterForm',
          subject: { entity: 'node', types: ['person'] },
          form: { fields: [{ id: 'f1', variable: 'name' }] },
          skipLogic: {
            action: 'SHOW',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'r1',
                  type: 'node',
                  options: { type: 'place', attribute: 'name' },
                },
                {
                  id: 'r2',
                  type: 'edge',
                  options: { type: 'knows', attribute: 'name' },
                },
                { id: 'r3', type: 'ego', options: { attribute: 'name' } },
              ],
            },
          },
        },
        {
          id: 'places',
          type: 'AlterForm',
          subject: { entity: 'node', types: ['place'] },
          form: { fields: [{ id: 'f2', variable: 'name' }] },
        },
      ],
    };
    const id = (owner: string) => testVariableId(`${owner} name`);
    renameCodebookIds(protocol, {
      variableId: (_key, owner) =>
        id(owner.entity === 'ego' ? 'ego' : owner.type),
    });

    expect(protocol.codebook.node.person.variables).toEqual({
      [id('person')]: { name: 'Name' },
    });
    expect(protocol.codebook.node.place.variables).toEqual({
      [id('place')]: { name: 'Name' },
    });
    expect(protocol.codebook.edge.knows.variables).toEqual({
      [id('knows')]: { name: 'N' },
    });
    expect(protocol.codebook.ego.variables).toEqual({
      [id('ego')]: { name: 'Name' },
    });
    const [people, places] = protocol.stages;
    expect(people?.form.fields[0]?.variable).toBe(id('person'));
    expect(
      people?.skipLogic?.filter.rules.map((rule) => rule.options.attribute),
    ).toEqual([id('place'), id('knows'), id('ego')]);
    expect(places?.form.fields[0]?.variable).toBe(id('place'));
  });

  it('renames a variable of a renamed type by the id its type had, and its references follow both', () => {
    const protocol = {
      codebook: {
        node: { person: { name: 'Person', variables: { age: { name: 'A' } } } },
      },
      stages: [
        {
          id: 'form',
          type: 'AlterForm',
          subject: { entity: 'node', types: ['person'] },
          form: { fields: [{ id: 'f1', variable: 'age' }] },
        },
      ],
    };
    const seenOwners: unknown[] = [];
    renameCodebookIds(protocol, {
      typeId: (type) => testTypeId(type),
      variableId: (key, owner) => {
        seenOwners.push(owner);
        return testVariableId(key);
      },
    });

    expect(seenOwners).toEqual([{ entity: 'node', type: 'person' }]);
    const types = recordAt(protocol, ['codebook', 'node']);
    expect(Object.keys(types)).toEqual([testTypeId('person')]);
    expect(
      Object.keys(recordAt(types, [testTypeId('person'), 'variables'])),
    ).toEqual([testVariableId('age')]);
    expect(valueAt(protocol, ['stages', 0, 'subject', 'types', 0])).toBe(
      testTypeId('person'),
    );
    expect(
      valueAt(protocol, ['stages', 0, 'form', 'fields', 0, 'variable']),
    ).toBe(testVariableId('age'));
  });
});

describe('the schema 8 to 9 migration', () => {
  const schema8 = () => asSchema8Protocol(completeProtocol());
  const migrate = (document: unknown) =>
    migrationV8toV9.migrate(ProtocolSchemaV8.parse(document), {});

  const codebookKeys = (protocol: unknown) => {
    const codebook = recordAt(protocol, ['codebook']);
    const types: string[] = [];
    const variables: string[] = [];
    for (const entity of ['node', 'edge'] as const) {
      const record = codebook[entity];
      if (!isRecord(record)) continue;
      for (const [type, definition] of Object.entries(record)) {
        types.push(type);
        if (isRecord(definition) && isRecord(definition.variables)) {
          variables.push(...Object.keys(definition.variables));
        }
      }
    }
    variables.push(
      ...Object.keys(recordAt(protocol, ['codebook', 'ego', 'variables'])),
    );
    return { types, variables };
  };

  it('gives every node type, edge type and variable a UUID key, and the result validates', () => {
    const original = schema8();
    const migrated = migrate(original);
    const before = codebookKeys(original);
    const after = codebookKeys(migrated);

    expect(after.types).toHaveLength(before.types.length);
    expect(after.types.every(isEntityTypeId)).toBe(true);
    // The migration adds a Family Pedigree's relativesNotRecorded attribute
    // where a stage had none; this fixture has one already.
    expect(after.variables).toHaveLength(before.variables.length);
    expect(after.variables.every(isVariableId)).toBe(true);
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('leaves no reference naming a key the version 8 document gave', () => {
    const original = schema8();
    const migrated = migrate(original);
    const { types, variables } = codebookKeys(migrated);
    const references = referencesIn(migrated);

    expect(references.length).toBeGreaterThan(50);
    for (const reference of references) {
      if (reference.dataSourceColumn) continue;
      const held = reference.held;
      expect({ at: reference.kind, held }).toEqual({
        at: reference.kind,
        held:
          reference.entity === undefined
            ? expect.toSatisfy((id: string) => variables.includes(id))
            : expect.toSatisfy((id: string) => types.includes(id)),
      });
    }
  });

  // Given its ids in schema 9's form, which the renaming reads.
  const schema8WithUuidKeys = () =>
    asSchema8Protocol(withTestCodebookIds(completeProtocol()));

  const heldId = (reference: Reference) => reference.held;

  it('keeps keys that were UUIDs already, and every reference still names them', () => {
    const original = schema8WithUuidKeys();
    const migrated = migrate(original);
    const before = codebookKeys(original);
    const after = codebookKeys(migrated);

    expect(before.types.every(isEntityTypeId)).toBe(true);
    expect(before.variables.every(isVariableId)).toBe(true);
    expect(after).toEqual(before);
    const references = referencesIn(migrated).filter(
      ({ dataSourceColumn }) => !dataSourceColumn,
    );
    expect(references.length).toBeGreaterThan(50);
    for (const reference of references) {
      expect({ at: reference.kind, held: heldId(reference) }).toEqual({
        at: reference.kind,
        held:
          reference.entity === undefined
            ? expect.toSatisfy((id: string) => before.variables.includes(id))
            : expect.toSatisfy((id: string) => before.types.includes(id)),
      });
    }
    expect(
      references.filter(
        (reference) => heldId(reference) === testVariableId('nickname'),
      ),
    ).not.toEqual([]);
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('keeps a UUID variable key, so a roster file whose columns name the variable by it still matches the codebook', () => {
    const protocol = withTestCodebookIds(completeProtocol());
    const roster = stageNamed(protocol, 'roster');
    const nameId = testVariableId('name');
    roster.searchOptions = { fuzziness: 0.5, matchProperties: [nameId] };
    roster.cardOptions = {
      additionalProperties: [
        { label: { en: 'Card detail' }, variable: nameId },
      ],
    };

    const migrated = migrate(asSchema8Protocol(protocol));
    const migratedRoster = stageOfType(migrated, 'NameGeneratorRoster');
    const subjectType = String(
      valueAt(migratedRoster, ['subject', 'types', 0]),
    );

    expect(subjectType).toBe(testTypeId('person'));
    expect(
      Object.keys(
        recordAt(migrated, ['codebook', 'node', subjectType, 'variables']),
      ),
    ).toContain(nameId);
    expect(
      valueAt(migratedRoster, ['searchOptions', 'matchProperties']),
    ).toEqual([nameId]);
    expect(
      valueAt(migratedRoster, [
        'cardOptions',
        'additionalProperties',
        0,
        'variable',
      ]),
    ).toBe(nameId);
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('keeps the UUID keys of a mixed codebook and gives the readable keys new ids', () => {
    const protocol = completeProtocol();
    renameCodebookIds(protocol, {
      typeId: (type) => (type === 'person' ? testTypeId(type) : type),
      variableId: (key, owner) =>
        owner.entity === 'node' && owner.type === 'person'
          ? testVariableId(key)
          : key,
    });
    const original = asSchema8Protocol(protocol);
    const before = codebookKeys(original);
    const migrated = migrate(original);
    const after = codebookKeys(migrated);

    const keptTypes = before.types.filter(isEntityTypeId);
    const keptVariables = before.variables.filter(isVariableId);
    expect(keptTypes).toEqual([testTypeId('person')]);
    expect(keptVariables).toContain(testVariableId('nickname'));
    expect(keptVariables.length).toBeLessThan(before.variables.length);

    expect(after.types.every(isEntityTypeId)).toBe(true);
    expect(after.variables.every(isVariableId)).toBe(true);
    expect(after.types.filter((id) => before.types.includes(id))).toEqual(
      keptTypes,
    );
    expect(
      after.variables.filter((id) => before.variables.includes(id)),
    ).toEqual(keptVariables);
    expect(after.variables).toHaveLength(before.variables.length);

    expect(
      valueAt(stageOfType(migrated, 'NameGenerator'), ['subject', 'types', 0]),
    ).toBe(testTypeId('person'));
    expect(
      valueAt(stageOfType(migrated, 'FamilyPedigree'), ['subject', 'types', 0]),
    ).toEqual(
      expect.toSatisfy(
        (id: unknown) =>
          typeof id === 'string' &&
          isEntityTypeId(id) &&
          after.types.includes(id) &&
          !keptTypes.includes(id),
      ),
    );
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('keeps a UUID variable key used by two entities for the first, and gives the other a new id its references follow', () => {
    const original = schema8WithUuidKeys();
    const nicknameId = testVariableId('nickname');
    const relativeVariables = recordAt(original, [
      'codebook',
      'node',
      testTypeId('relative'),
      'variables',
    ]);
    // Schema 8 allowed a key on two entity types; schema 9 does not.
    relativeVariables[nicknameId] = {
      name: 'RelativeNickname',
      type: 'text',
      component: 'Text',
    };
    const pedigree = stageNamed(original, 'familyPedigree');
    arrayAt(pedigree, ['form', 'fields']).push({
      id: 'nickname-field',
      variable: nicknameId,
      prompt: 'Nick',
    });

    const migrated = migrate(original);
    const personVariables = recordAt(migrated, [
      'codebook',
      'node',
      testTypeId('person'),
      'variables',
    ]);
    const relativeNickname = Object.entries(
      recordAt(migrated, [
        'codebook',
        'node',
        testTypeId('relative'),
        'variables',
      ]),
    ).find(
      ([, definition]) =>
        isRecord(definition) && definition.name === 'RelativeNickname',
    )?.[0];

    expect(personVariables[nicknameId]).toMatchObject({ name: 'Nickname' });
    expect(relativeNickname).toEqual(
      expect.toSatisfy(
        (id: unknown) =>
          typeof id === 'string' && isVariableId(id) && id !== nicknameId,
      ),
    );
    expect(
      arrayAt(stageOfType(migrated, 'FamilyPedigree'), ['form', 'fields']).at(
        -1,
      ),
    ).toMatchObject({ variable: relativeNickname });
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('keeps a UUID that is both a type key and a variable key in both places, which validation accepts', () => {
    const protocol = withTestCodebookIds(completeProtocol());
    const personId = testTypeId('person');
    renameCodebookIds(protocol, {
      typeId: (type, entity) =>
        entity === 'edge' && type === testTypeId('knows') ? personId : type,
      variableId: (key) =>
        key === testVariableId('nickname') ? personId : key,
    });
    const original = asSchema8Protocol(protocol);
    const migrated = migrate(original);

    expect(codebookKeys(migrated)).toEqual(codebookKeys(original));
    expect(Object.keys(recordAt(migrated, ['codebook', 'edge']))).toContain(
      personId,
    );
    expect(
      Object.keys(
        recordAt(migrated, ['codebook', 'node', personId, 'variables']),
      ),
    ).toContain(personId);
    expect(issuesOf(migrated)).toEqual([]);
  });

  it('gives one key on two node types an id for each, and each reference the id of its own', () => {
    const original = schema8();
    const relative = recordAt(original, ['codebook', 'node', 'relative']);
    const relativeVariables = recordAt(relative, ['variables']);
    // Schema 8 allowed a key on two entity types; schema 9 does not.
    relativeVariables.nickname = {
      name: 'Nickname',
      type: 'text',
      component: 'Text',
    };
    const pedigree = stageNamed(original, 'familyPedigree');
    const fields = arrayAt(pedigree, ['form', 'fields']);
    fields.push({ id: 'nickname-field', variable: 'nickname', prompt: 'Nick' });

    const migrated = migrate(original);
    const personType = valueAt(stageOfType(migrated, 'NameGenerator'), [
      'subject',
      'types',
      0,
    ]);
    const migratedPedigree = stageOfType(migrated, 'FamilyPedigree');
    const relativeType = valueAt(migratedPedigree, ['subject', 'types', 0]);
    const nicknameOf = (type: unknown) =>
      Object.entries(
        recordAt(migrated, ['codebook', 'node', String(type), 'variables']),
      ).find(
        ([, definition]) =>
          isRecord(definition) && definition.name === 'Nickname',
      )?.[0];
    const personNickname = nicknameOf(personType);
    const relativeNickname = nicknameOf(relativeType);

    expect(personNickname).toEqual(expect.any(String));
    expect(relativeNickname).toEqual(expect.any(String));
    expect(personNickname).not.toBe(relativeNickname);
    expect(arrayAt(migratedPedigree, ['form', 'fields']).at(-1)).toMatchObject({
      variable: relativeNickname,
    });
    // Validation resolves each reference against its own stage's subject.
    expect(issuesOf(migrated)).toEqual([]);
  });
});
