import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EdgeStageSubjectSchema } from '../common/subjects.ts';
import {
  type DynamicValueSite,
  dynamicValueRolesAt,
} from '../dynamic-values.ts';
import {
  entityAttributeReference,
  getEntityAttributeReferenceDescriptor,
} from '../entity-attribute-reference.ts';
import {
  getLocalizedStringDescriptor,
  localizedString,
} from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import {
  nodeTypeCapabilityOf,
  STAGE_NODE_TYPE_CAPABILITY,
} from '../stage-capabilities.ts';
import { stageSchema } from '../stages/index.ts';

/*
 * A stage that runs several node types has no single subject type to resolve
 * a stage-subject reference against. Two kinds of site resolve against it: an
 * attribute reference tagged 'stageSubject', and text that may show dynamic
 * values about the node or edge the stage is on (a prompt or a form field's
 * caption, reported with a `(dynamic values)` suffix). Every such site must
 * either sit inside an object that carries its own single-typed `subject`
 * (a Network Composer entry), or be a field that only a single-type stage may
 * set, listed here with a protocol that sets it on a stage listing two node
 * types and the issue path validation must report for it.
 */
type SingleTypeOnlyField = {
  field: string;
  rejects: () => unknown;
  issuePath: readonly (string | number)[];
};

const SINGLE_TYPE_ONLY_FIELDS: Partial<
  Record<string, readonly SingleTypeOnlyField[]>
> = {};

const DYNAMIC_VALUES_SUFFIX = ' (dynamic values)';

// Sites whose dynamic values cannot be about the entity the stage is on: text
// about the stage as a whole shows only the participant, and a node label
// sits on no stage. Every other site counts, so a new kind of site is checked
// until it is added here.
const STAGE_INDEPENDENT_DYNAMIC_VALUE_SITES: ReadonlySet<DynamicValueSite> =
  new Set<DynamicValueSite>(['stageText', 'nodeLabel']);

// A prompt shows values only of the entities its interface is on while it
// shows (`dynamicValueRolesAt`): on a canvas of many nodes that is the ego
// alone. Asked of a bin in select mode, which adds the node being placed, so
// a stage whose roles depend on its behaviours is counted.
const siteCanShowStageEntity = (
  stageType: string | undefined,
  site: DynamicValueSite,
): boolean =>
  site !== 'prompt' ||
  stageType === undefined ||
  [
    ...dynamicValueRolesAt(
      { type: stageType, behaviours: { interactionMode: 'select' } },
      site,
      undefined,
    ),
  ].some((role) => role !== 'ego');

const unwrapToObject = (schema: unknown): z.ZodObject | undefined => {
  if (schema instanceof z.ZodObject) return schema;
  if (schema instanceof z.ZodPipe) return unwrapToObject(schema.in);
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    return unwrapToObject(schema.unwrap());
  }
  return undefined;
};

const stageTypeOf = (schema: z.ZodType): string | undefined => {
  const type = unwrapToObject(schema)?.shape.type;
  return type instanceof z.ZodLiteral ? String(type.value) : undefined;
};

// A nested `subject` answers for the references beside it only when it names
// exactly one type: a singular `{ entity, type }`, never a `types` list.
const isSingleTypedSubject = (schema: unknown): boolean => {
  const shape = unwrapToObject(schema)?.shape;
  return shape !== undefined && 'type' in shape && !('types' in shape);
};

// The dotted paths of every stage-subject site in `schema` that no enclosing
// object's own `subject` answers for. Array elements and record values add
// `[]` to the path.
const unanchoredStageSubjectReferences = (
  schema: z.ZodType,
  honourOwnSubject = true,
  stageType = stageTypeOf(schema),
): string[] => {
  const found = new Set<string>();
  // Schemas are shared between places (a form schema serves the stage and
  // each Composer entry), so a schema is revisited at every new place.
  const seen = new Map<z.ZodType, Set<string>>();
  const visit = (node: z.ZodType, path: string[], anchored: boolean) => {
    const place = `${path.join('.')}|${anchored}`;
    const places = seen.get(node) ?? new Set<string>();
    if (places.has(place) || path.length > 30) return;
    places.add(place);
    seen.set(node, places);
    if (!anchored) {
      if (
        getEntityAttributeReferenceDescriptor(node)?.subject === 'stageSubject'
      ) {
        found.add(path.join('.'));
      }
      const site = getLocalizedStringDescriptor(node)?.dynamicValues;
      if (
        site !== undefined &&
        !STAGE_INDEPENDENT_DYNAMIC_VALUE_SITES.has(site) &&
        siteCanShowStageEntity(stageType, site)
      ) {
        found.add(`${path.join('.')}${DYNAMIC_VALUES_SUFFIX}`);
      }
    }
    const child = (
      next: unknown,
      nextPath: string[],
      nextAnchored: boolean,
    ) => {
      if (next instanceof z.ZodType) visit(next, nextPath, nextAnchored);
    };
    if (
      node instanceof z.ZodOptional ||
      node instanceof z.ZodNullable ||
      node instanceof z.ZodDefault
    ) {
      child(node.unwrap(), path, anchored);
    } else if (node instanceof z.ZodPipe) {
      child(node.in, path, anchored);
    } else if (node instanceof z.ZodLazy) {
      child(node.unwrap(), path, anchored);
    } else if (node instanceof z.ZodObject) {
      const ownSubject =
        honourOwnSubject &&
        path.length > 0 &&
        isSingleTypedSubject(node.shape.subject);
      for (const [key, value] of Object.entries(node.shape)) {
        child(value, [...path, key], anchored || ownSubject);
      }
    } else if (node instanceof z.ZodArray) {
      child(node.element, [...path, '[]'], anchored);
    } else if (node instanceof z.ZodRecord) {
      child(node.valueType, [...path, '[]'], anchored);
    } else if (node instanceof z.ZodUnion) {
      for (const option of node.options) child(option, path, anchored);
    } else if (node instanceof z.ZodIntersection) {
      child(node._zod.def.left, path, anchored);
      child(node._zod.def.right, path, anchored);
    }
  };
  visit(schema, [], false);
  return [...found].toSorted();
};

const stageSchemasByType = () =>
  new Map(
    stageSchema.options.flatMap((option) => {
      const type = stageTypeOf(option);
      return type ? [[type, option] as const] : [];
    }),
  );

// For every stage type that runs several node types, the references that
// neither an own subject nor SINGLE_TYPE_ONLY_FIELDS accounts for.
const multiTypeProblems = () => {
  const problems: Record<string, string[]> = {};
  for (const [type, schema] of stageSchemasByType()) {
    if (nodeTypeCapabilityOf(type) !== 'several') continue;
    const allowed = new Set(
      (SINGLE_TYPE_ONLY_FIELDS[type] ?? []).map(({ field }) => field),
    );
    const unlisted = unanchoredStageSubjectReferences(schema).filter(
      (path) => !allowed.has(path),
    );
    if (unlisted.length > 0) problems[type] = unlisted;
  }
  return problems;
};

const issuePathsOf = (protocol: unknown): string[] => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
};

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stageAt = (protocol: unknown, index: number): Fields | undefined => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return undefined;
  const stage: unknown = protocol.stages[index];
  return isRecord(stage) ? stage : undefined;
};

const nodeTypesOf = (stage: Fields): unknown[] =>
  isRecord(stage.subject) &&
  stage.subject.entity === 'node' &&
  Array.isArray(stage.subject.types)
    ? stage.subject.types
    : [];

// The same protocol with the stage's types cut to the first one.
const withFirstTypeOnly = (protocol: unknown, index: number): unknown => {
  const copy = structuredClone(protocol);
  const stage = stageAt(copy, index);
  if (stage && isRecord(stage.subject)) {
    stage.subject.types = nodeTypesOf(stage).slice(0, 1);
  }
  return copy;
};

// The listed field an issue path sits in, with array indexes as `[]`.
const fieldOfIssuePath = (path: readonly (string | number)[]) =>
  path.map((segment) => (typeof segment === 'number' ? '[]' : segment));

const fieldPathOf = (field: string) =>
  field.endsWith(DYNAMIC_VALUES_SUFFIX)
    ? field.slice(0, -DYNAMIC_VALUES_SUFFIX.length)
    : field;

// An entry proves its field only when its protocol sets that field on a stage
// of the listed type that lists two node types, validation reports an issue
// in that field, and the issue goes away when the stage lists only its first
// type, so the second type is what validation refuses.
const provesField = (
  type: string,
  { field, rejects, issuePath }: SingleTypeOnlyField,
  issuePathsFor: (protocol: unknown) => string[],
): boolean => {
  const [root, index, ...rest] = issuePath;
  if (root !== 'stages' || typeof index !== 'number') return false;
  const restField = fieldOfIssuePath(rest).join('.');
  const fieldPath = fieldPathOf(field);
  if (restField !== fieldPath && !restField.startsWith(`${fieldPath}.`)) {
    return false;
  }
  const protocol = rejects();
  const stage = stageAt(protocol, index);
  if (stage?.type !== type) return false;
  if (new Set(nodeTypesOf(stage)).size < 2) return false;
  const at = issuePath.join('.');
  return (
    issuePathsFor(protocol).includes(at) &&
    !issuePathsFor(withFirstTypeOnly(protocol, index)).includes(at)
  );
};

// The listed fields that their entry does not prove validation rejects.
const unprovenListedFields = (
  listed: Partial<Record<string, readonly SingleTypeOnlyField[]>>,
  issuePathsFor: (protocol: unknown) => string[] = issuePathsOf,
): string[] =>
  Object.entries(listed).flatMap(([type, fields]) =>
    (fields ?? []).flatMap((entry) =>
      provesField(type, entry, issuePathsFor) ? [] : [`${type} ${entry.field}`],
    ),
  );

// The listed entries on a stage type that does not run several node types, or
// that name a field which is not an unanchored stage-subject reference of it.
const misplacedListedFields = (
  listed: Partial<Record<string, readonly SingleTypeOnlyField[]>>,
): string[] => {
  const schemas = stageSchemasByType();
  return Object.entries(listed).flatMap(([type, fields]) => {
    const schema = schemas.get(type);
    const references =
      schema && nodeTypeCapabilityOf(type) === 'several'
        ? unanchoredStageSubjectReferences(schema)
        : [];
    return (fields ?? []).flatMap(({ field }) =>
      references.includes(field) ? [] : [`${type} ${field}`],
    );
  });
};

const loadAllInterfacesFixture = (): unknown =>
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../protocols/e2e/all-interfaces/protocol.json',
      ),
      'utf8',
    ),
  );

describe('stage-subject references on stages that run several node types', () => {
  it('reads a type from every stage schema', () => {
    expect(stageSchemasByType().size).toBe(stageSchema.options.length);
  });

  it('each sits inside an object with its own subject, or is a listed single-type field', () => {
    expect(multiTypeProblems()).toEqual({});
  });

  it('lists only fields that exist, on stages that run several node types', () => {
    expect(misplacedListedFields(SINGLE_TYPE_ONLY_FIELDS)).toEqual([]);
  });

  describe('placement of a listed field', () => {
    const SORT_PROPERTY = 'prompts.[].bucketSortOrder.[].property';

    it('reports an entry for a stage type that runs one node type', () => {
      expect(nodeTypeCapabilityOf('OrdinalBin')).toBe('single');
      expect(
        misplacedListedFields({
          OrdinalBin: [
            { field: SORT_PROPERTY, rejects: () => null, issuePath: [] },
          ],
        }),
      ).toEqual([`OrdinalBin ${SORT_PROPERTY}`]);
    });

    it('reports an entry naming a field that is not a stage-subject reference', () => {
      const before = STAGE_NODE_TYPE_CAPABILITY.OrdinalBin;
      try {
        STAGE_NODE_TYPE_CAPABILITY.OrdinalBin = 'several';
        expect(
          misplacedListedFields({
            OrdinalBin: [
              { field: SORT_PROPERTY, rejects: () => null, issuePath: [] },
              {
                field: 'prompts.[].no-such-field',
                rejects: () => null,
                issuePath: [],
              },
            ],
          }),
        ).toEqual(['OrdinalBin prompts.[].no-such-field']);
      } finally {
        STAGE_NODE_TYPE_CAPABILITY.OrdinalBin = before;
      }
    });
  });

  it('validation rejects each listed field on a stage listing two node types', () => {
    expect(unprovenListedFields(SINGLE_TYPE_ONLY_FIELDS)).toEqual([]);
  });

  describe('proof of a listed field', () => {
    const ORDINAL_BIN = 10;
    const PLACE = 'd2904722-c463-5fe3-8f6d-032114d8ed55';
    const SORT_PATH = [
      'stages',
      ORDINAL_BIN,
      'prompts',
      0,
      'bucketSortOrder',
      0,
      'property',
    ] as const;
    const SORT_PROPERTY = 'prompts.[].bucketSortOrder.[].property';

    const ordinalBinWith = (change: (stage: Fields) => void) => () => {
      const protocol = loadAllInterfacesFixture();
      const stage = stageAt(protocol, ORDINAL_BIN);
      if (stage?.type !== 'OrdinalBin') throw new Error('No Ordinal Bin stage');
      change(stage);
      return protocol;
    };

    const twoTypes = ordinalBinWith((stage) => {
      stage.subject = {
        entity: 'node',
        types: [...nodeTypesOf(stage), PLACE],
      };
    });

    const numericSortProperty = (stage: Fields) => {
      const prompt: unknown = Array.isArray(stage.prompts)
        ? stage.prompts[0]
        : undefined;
      if (!isRecord(prompt)) throw new Error('No prompt');
      prompt.bucketSortOrder = [
        {
          id: '0c2b5bd4-8f39-4e33-9d1b-31c4f1e3b8a2',
          property: 42,
          direction: 'asc',
        },
      ];
    };

    // Stands in for a validation rule that refuses the sort order on a stage
    // listing two types, which no stage has while every one runs one type.
    const refusesSortOnTwoTypes = (protocol: unknown) => {
      const stage = stageAt(protocol, ORDINAL_BIN);
      return stage && nodeTypesOf(stage).length >= 2
        ? [SORT_PATH.join('.')]
        : [];
    };

    it('accepts an entry whose second type is what validation refuses', () => {
      expect(
        unprovenListedFields(
          {
            OrdinalBin: [
              {
                field: SORT_PROPERTY,
                rejects: twoTypes,
                issuePath: SORT_PATH,
              },
            ],
          },
          refusesSortOnTwoTypes,
        ),
      ).toEqual([]);
    });

    it('reports an entry whose protocol validation accepts', () => {
      expect(issuePathsOf(twoTypes())).not.toContain(SORT_PATH.join('.'));
      expect(
        unprovenListedFields({
          OrdinalBin: [
            {
              field: SORT_PROPERTY,
              rejects: twoTypes,
              issuePath: SORT_PATH,
            },
          ],
        }),
      ).toEqual([`OrdinalBin ${SORT_PROPERTY}`]);
    });

    it('reports an entry whose issue path points at a stage of another type', () => {
      expect(
        unprovenListedFields(
          {
            OrdinalBin: [
              {
                field: SORT_PROPERTY,
                rejects: loadAllInterfacesFixture,
                issuePath: [
                  'stages',
                  0,
                  'prompts',
                  0,
                  'bucketSortOrder',
                  0,
                  'property',
                ],
              },
            ],
          },
          () => ['stages.0.prompts.0.bucketSortOrder.0.property'],
        ),
      ).toEqual([`OrdinalBin ${SORT_PROPERTY}`]);
    });

    it('reports an entry whose stage lists one type', () => {
      const rejects = ordinalBinWith(numericSortProperty);
      expect(issuePathsOf(rejects())).toContain(SORT_PATH.join('.'));
      expect(
        unprovenListedFields({
          OrdinalBin: [{ field: SORT_PROPERTY, rejects, issuePath: SORT_PATH }],
        }),
      ).toEqual([`OrdinalBin ${SORT_PROPERTY}`]);
    });

    it('reports an entry whose stage is of another type', () => {
      expect(
        unprovenListedFields(
          {
            CategoricalBin: [
              {
                field: SORT_PROPERTY,
                rejects: twoTypes,
                issuePath: SORT_PATH,
              },
            ],
          },
          refusesSortOnTwoTypes,
        ),
      ).toEqual([`CategoricalBin ${SORT_PROPERTY}`]);
    });

    it('reports an entry whose issue path is in another field', () => {
      expect(
        unprovenListedFields(
          {
            OrdinalBin: [
              {
                field: 'prompts.[].edges.create',
                rejects: twoTypes,
                issuePath: SORT_PATH,
              },
            ],
          },
          refusesSortOnTwoTypes,
        ),
      ).toEqual(['OrdinalBin prompts.[].edges.create']);
    });

    it('reports an entry that validation refuses whatever the stage lists', () => {
      expect(
        unprovenListedFields(
          {
            OrdinalBin: [
              {
                field: SORT_PROPERTY,
                rejects: twoTypes,
                issuePath: SORT_PATH,
              },
            ],
          },
          () => [SORT_PATH.join('.')],
        ),
      ).toEqual([`OrdinalBin ${SORT_PROPERTY}`]);
    });
  });

  it('fails when a form whose fields show dynamic values is raised to several types', () => {
    const before = STAGE_NODE_TYPE_CAPABILITY.AlterForm;
    try {
      STAGE_NODE_TYPE_CAPABILITY.AlterForm = 'several';
      expect(multiTypeProblems().AlterForm).toEqual(
        expect.arrayContaining([
          `form.fields.[].prompt${DYNAMIC_VALUES_SUFFIX}`,
        ]),
      );
    } finally {
      STAGE_NODE_TYPE_CAPABILITY.AlterForm = before;
    }
  });

  it('fails when a stage with an unlisted stage-subject reference is raised to several types', () => {
    const before = STAGE_NODE_TYPE_CAPABILITY.OrdinalBin;
    try {
      STAGE_NODE_TYPE_CAPABILITY.OrdinalBin = 'several';
      const problems = multiTypeProblems();
      expect(problems.OrdinalBin).toEqual(
        expect.arrayContaining(['prompts.[].bucketSortOrder.[].property']),
      );
    } finally {
      STAGE_NODE_TYPE_CAPABILITY.OrdinalBin = before;
    }
  });

  it('does not count a prompt whose dynamic values cannot be about a node of the stage', () => {
    const schema = stageSchemasByType().get('Sociogram');
    if (!schema) throw new Error('No Sociogram stage');
    expect(unanchoredStageSubjectReferences(schema)).toEqual([]);
    expect(
      unanchoredStageSubjectReferences(schema, true, 'DyadCensus'),
    ).toEqual(['prompts.[].text (dynamic values)']);
  });

  it('fails when a census whose prompts show dynamic values is raised to several types', () => {
    const before = STAGE_NODE_TYPE_CAPABILITY.DyadCensus;
    try {
      STAGE_NODE_TYPE_CAPABILITY.DyadCensus = 'several';
      expect(multiTypeProblems().DyadCensus).toEqual(
        expect.arrayContaining([`prompts.[].text${DYNAMIC_VALUES_SUFFIX}`]),
      );
    } finally {
      STAGE_NODE_TYPE_CAPABILITY.DyadCensus = before;
    }
  });

  it('sees through a Network Composer entry that carries its own subject', () => {
    const before = STAGE_NODE_TYPE_CAPABILITY.NetworkComposer;
    try {
      STAGE_NODE_TYPE_CAPABILITY.NetworkComposer = 'several';
      const schema = stageSchemasByType().get('NetworkComposer');
      if (!schema) throw new Error('No NetworkComposer stage');
      const isEntryPath = (path: string) => path.startsWith('edges.');
      expect(
        unanchoredStageSubjectReferences(schema, false).some(isEntryPath),
      ).toBe(true);
      expect(unanchoredStageSubjectReferences(schema).some(isEntryPath)).toBe(
        false,
      );
    } finally {
      STAGE_NODE_TYPE_CAPABILITY.NetworkComposer = before;
    }
  });

  it('is not anchored by a nested subject that lists several types', () => {
    const variable = entityAttributeReference({
      subject: 'stageSubject',
      usage: 'validatedAttribute',
    });
    const text = localizedString(
      z.string(),
      { format: 'plain', lines: 'single' },
      { dynamicValues: 'formField' },
    );
    const entry = (subject: z.ZodType) => z.object({ subject, variable, text });
    const schema = z.object({
      type: z.literal('Probe'),
      single: z.array(entry(EdgeStageSubjectSchema)),
      listed: z.array(
        entry(
          z.strictObject({
            entity: z.literal('node'),
            types: z.array(z.string()),
          }),
        ),
      ),
    });
    expect(unanchoredStageSubjectReferences(schema)).toEqual([
      'listed.[].text (dynamic values)',
      'listed.[].variable',
    ]);
  });
});
