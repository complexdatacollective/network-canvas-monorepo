import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EdgeStageSubjectSchema } from '../common/subjects.ts';
import type { DynamicValueSite } from '../dynamic-values.ts';
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
        !STAGE_INDEPENDENT_DYNAMIC_VALUE_SITES.has(site)
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
    const schemas = stageSchemasByType();
    for (const [type, fields] of Object.entries(SINGLE_TYPE_ONLY_FIELDS)) {
      expect(nodeTypeCapabilityOf(type), type).toBe('several');
      const schema = schemas.get(type);
      if (!schema) throw new Error(`No stage type ${type}`);
      const references = unanchoredStageSubjectReferences(schema);
      for (const { field } of fields ?? []) {
        expect(references, `${type} ${field}`).toContain(field);
      }
    }
  });

  it('validation rejects each listed field on a stage listing two node types', () => {
    expect(unprovenListedFields(SINGLE_TYPE_ONLY_FIELDS)).toEqual([]);
  });

  describe('proof of a listed field', () => {
    const SOCIOGRAM = 6;
    const PLACE = 'd2904722-c463-5fe3-8f6d-032114d8ed55';
    const HIGHLIGHT_PATH = [
      'stages',
      SOCIOGRAM,
      'prompts',
      1,
      'highlight',
      'variable',
    ] as const;
    const HIGHLIGHT = 'prompts.[].highlight.variable';

    const sociogramWith = (change: (stage: Fields) => void) => () => {
      const protocol = loadAllInterfacesFixture();
      const stage = stageAt(protocol, SOCIOGRAM);
      if (stage?.type !== 'Sociogram') throw new Error('No Sociogram stage');
      change(stage);
      return protocol;
    };

    const twoTypes = sociogramWith((stage) => {
      stage.subject = {
        entity: 'node',
        types: [...nodeTypesOf(stage), PLACE],
      };
    });

    const unknownHighlightVariable = (stage: Fields) => {
      const prompt: unknown = Array.isArray(stage.prompts)
        ? stage.prompts[1]
        : undefined;
      if (!isRecord(prompt) || !isRecord(prompt.highlight)) {
        throw new Error('No highlight on the second prompt');
      }
      prompt.highlight.variable = 'no-such-variable';
    };

    // Stands in for a validation rule that refuses the highlight on a stage
    // listing two types, which no stage has while every one runs one type.
    const refusesHighlightOnTwoTypes = (protocol: unknown) => {
      const stage = stageAt(protocol, SOCIOGRAM);
      return stage && nodeTypesOf(stage).length >= 2
        ? [HIGHLIGHT_PATH.join('.')]
        : [];
    };

    it('accepts an entry whose second type is what validation refuses', () => {
      expect(
        unprovenListedFields(
          {
            Sociogram: [
              {
                field: HIGHLIGHT,
                rejects: twoTypes,
                issuePath: HIGHLIGHT_PATH,
              },
            ],
          },
          refusesHighlightOnTwoTypes,
        ),
      ).toEqual([]);
    });

    it('reports an entry whose protocol validation accepts', () => {
      expect(
        unprovenListedFields({
          Sociogram: [
            {
              field: HIGHLIGHT,
              rejects: loadAllInterfacesFixture,
              issuePath: ['stages', 0, 'prompts', 0, 'highlight', 'variable'],
            },
          ],
        }),
      ).toEqual([`Sociogram ${HIGHLIGHT}`]);
    });

    it('reports an entry whose stage lists one type', () => {
      const rejects = sociogramWith(unknownHighlightVariable);
      expect(issuePathsOf(rejects())).toContain(HIGHLIGHT_PATH.join('.'));
      expect(
        unprovenListedFields({
          Sociogram: [{ field: HIGHLIGHT, rejects, issuePath: HIGHLIGHT_PATH }],
        }),
      ).toEqual([`Sociogram ${HIGHLIGHT}`]);
    });

    it('reports an entry whose stage is of another type', () => {
      expect(
        unprovenListedFields(
          {
            Narrative: [
              {
                field: HIGHLIGHT,
                rejects: twoTypes,
                issuePath: HIGHLIGHT_PATH,
              },
            ],
          },
          refusesHighlightOnTwoTypes,
        ),
      ).toEqual([`Narrative ${HIGHLIGHT}`]);
    });

    it('reports an entry whose issue path is in another field', () => {
      expect(
        unprovenListedFields(
          {
            Sociogram: [
              {
                field: 'prompts.[].edges.create',
                rejects: twoTypes,
                issuePath: HIGHLIGHT_PATH,
              },
            ],
          },
          refusesHighlightOnTwoTypes,
        ),
      ).toEqual(['Sociogram prompts.[].edges.create']);
    });

    it('reports an entry that validation refuses whatever the stage lists', () => {
      expect(
        unprovenListedFields(
          {
            Sociogram: [
              {
                field: HIGHLIGHT,
                rejects: twoTypes,
                issuePath: HIGHLIGHT_PATH,
              },
            ],
          },
          () => [HIGHLIGHT_PATH.join('.')],
        ),
      ).toEqual([`Sociogram ${HIGHLIGHT}`]);
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
    const before = STAGE_NODE_TYPE_CAPABILITY.Sociogram;
    try {
      STAGE_NODE_TYPE_CAPABILITY.Sociogram = 'several';
      const problems = multiTypeProblems();
      expect(problems.Sociogram).toEqual(
        expect.arrayContaining(['prompts.[].highlight.variable']),
      );
    } finally {
      STAGE_NODE_TYPE_CAPABILITY.Sociogram = before;
    }
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
      { dynamicValues: 'prompt' },
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
