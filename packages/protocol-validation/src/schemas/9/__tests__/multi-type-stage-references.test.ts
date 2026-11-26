import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getEntityAttributeReferenceDescriptor } from '../entity-attribute-reference.ts';
import {
  nodeTypeCapabilityOf,
  STAGE_NODE_TYPE_CAPABILITY,
} from '../stage-capabilities.ts';
import { stageSchema } from '../stages/index.ts';

/*
 * A stage that runs several node types has no single subject type to resolve
 * a stage-subject attribute reference against. Every such reference must
 * either sit inside an object that carries its own single-typed `subject`
 * (a Network Composer entry), or be a field that only a single-type stage may
 * set, listed here. A slice that raises a stage to 'several' lists each such
 * field and adds a fixture proving validation rejects it with two types.
 */
const SINGLE_TYPE_ONLY_FIELDS: Partial<Record<string, readonly string[]>> = {};

const unwrapToObject = (schema: unknown): z.ZodObject | undefined => {
  if (schema instanceof z.ZodObject) return schema;
  if (schema instanceof z.ZodPipe) return unwrapToObject(schema.in);
  return undefined;
};

const stageTypeOf = (schema: z.ZodType): string | undefined => {
  const type = unwrapToObject(schema)?.shape.type;
  return type instanceof z.ZodLiteral ? String(type.value) : undefined;
};

// The dotted paths of every stage-subject attribute reference in `schema`
// that no enclosing object's own `subject` answers for. Array elements and
// record values add `[]` to the path.
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
    const descriptor = getEntityAttributeReferenceDescriptor(node);
    if (descriptor?.subject === 'stageSubject' && !anchored) {
      found.add(path.join('.'));
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
        honourOwnSubject && path.length > 0 && 'subject' in node.shape;
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
    const allowed = new Set(SINGLE_TYPE_ONLY_FIELDS[type] ?? []);
    const unlisted = unanchoredStageSubjectReferences(schema).filter(
      (path) => !allowed.has(path),
    );
    if (unlisted.length > 0) problems[type] = unlisted;
  }
  return problems;
};

describe('stage-subject references on stages that run several node types', () => {
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
      for (const field of fields ?? []) {
        expect(references, `${type} ${field}`).toContain(field);
      }
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
});
