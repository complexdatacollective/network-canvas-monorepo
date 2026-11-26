import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EdgeStageSubjectSchema } from '../common/subjects.ts';
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

// Sites whose dynamic values can be about the entity the stage is on. Text
// about the stage as a whole shows only the participant, and a node label
// sits on no stage.
const SUBJECT_DYNAMIC_VALUE_SITES = new Set(['prompt', 'formField']);

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
      if (site !== undefined && SUBJECT_DYNAMIC_VALUE_SITES.has(site)) {
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

// The listed fields whose protocol validation does not reject at the field.
const unprovenListedFields = (
  listed: Partial<Record<string, readonly SingleTypeOnlyField[]>>,
): string[] =>
  Object.entries(listed).flatMap(([type, fields]) =>
    (fields ?? []).flatMap(({ field, rejects, issuePath }) =>
      issuePathsOf(rejects()).includes(issuePath.join('.'))
        ? []
        : [`${type} ${field}`],
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

  it('reports a listed field whose protocol validation accepts', () => {
    expect(
      unprovenListedFields({
        Sociogram: [
          {
            field: 'prompts.[].highlight.variable',
            rejects: loadAllInterfacesFixture,
            issuePath: ['stages', 0, 'prompts', 0, 'highlight', 'variable'],
          },
        ],
      }),
    ).toEqual(['Sociogram prompts.[].highlight.variable']);
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
