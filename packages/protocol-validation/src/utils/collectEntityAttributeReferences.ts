import { type z } from 'zod';
import type * as core from 'zod/v4/core';

import { CurrentProtocolSchema } from '../schemas';
import type { StageSubject } from '../schemas/8/common';
import {
  getEntityAttributeReferenceDescriptor,
  type SubjectResolution,
} from '../schemas/8/entity-attribute-reference';
import type { VariableType } from '../schemas/8/variables/types';

export type EntityAttributeReferenceHit = {
  path: (string | number)[];
  variableId: string;
  subject?: StageSubject;
  requireType?: readonly VariableType[];
};

type WalkContext = {
  stageSubject?: StageSubject;
  parent?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Peel optional / nullable / default wrappers to reach the meaningful node.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    const type = current._zod.def.type;
    if (type === 'optional' || type === 'nullable' || type === 'default') {
      current = (current._zod.def as core.$ZodOptionalDef)
        .innerType as z.ZodType;
      continue;
    }
    return current;
  }
};

const stageSubjectOf = (
  value: Record<string, unknown>,
): StageSubject | undefined => {
  if (value.type === 'EgoForm') return { entity: 'ego' };
  const subject = value.subject;
  if (isRecord(subject) && typeof subject.entity === 'string') {
    return subject as StageSubject;
  }
  return undefined;
};

const resolveSubject = (
  resolution: SubjectResolution,
  path: (string | number)[],
  ctx: WalkContext,
): StageSubject | undefined => {
  if (resolution === 'ego') return { entity: 'ego' };
  if (resolution === 'stageSubject') return ctx.stageSubject;
  if (resolution === 'filterRule') return undefined;
  if (resolution === 'owningVariable') {
    const cbIndex = path.indexOf('codebook');
    if (cbIndex === -1) return undefined;
    const entity = path[cbIndex + 1];
    if (entity === 'ego') return { entity: 'ego' };
    if (entity === 'node' || entity === 'edge') {
      const type = path[cbIndex + 2];
      return typeof type === 'string' ? { entity, type } : undefined;
    }
    return undefined;
  }
  // { sibling, entity }
  const type = ctx.parent?.[resolution.sibling];
  return typeof type === 'string'
    ? { entity: resolution.entity, type }
    : undefined;
};

const walk = (
  schema: z.ZodType,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): EntityAttributeReferenceHit[] => {
  if (value === undefined || value === null) return [];
  const node = unwrap(schema);
  const def = node._zod.def;

  switch (def.type) {
    case 'string': {
      const descriptor = getEntityAttributeReferenceDescriptor(node);
      if (!descriptor || typeof value !== 'string') return [];
      return [
        {
          path,
          variableId: value,
          subject: resolveSubject(descriptor.subject, path, ctx),
          requireType: descriptor.requireType,
        },
      ];
    }
    case 'object': {
      if (!isRecord(value)) return [];
      const shape = (def as core.$ZodObjectDef).shape;
      const childCtx: WalkContext = {
        stageSubject: stageSubjectOf(value) ?? ctx.stageSubject,
        parent: value,
      };
      return Object.keys(shape).flatMap((key) =>
        walk(shape[key] as z.ZodType, value[key], [...path, key], childCtx),
      );
    }
    case 'array': {
      if (!Array.isArray(value)) return [];
      const element = (def as core.$ZodArrayDef).element as z.ZodType;
      return value.flatMap((item, index) =>
        walk(element, item, [...path, index], ctx),
      );
    }
    case 'record': {
      if (!isRecord(value)) return [];
      const valueType = (def as core.$ZodRecordDef).valueType as z.ZodType;
      return Object.keys(value).flatMap((key) =>
        walk(valueType, value[key], [...path, key], ctx),
      );
    }
    case 'union': {
      const options = (def as core.$ZodUnionDef).options as z.ZodType[];
      const match = options.find((option) => option.safeParse(value).success);
      return match ? walk(match, value, path, ctx) : [];
    }
    default:
      return [];
  }
};

export const collectEntityAttributeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityAttributeReferenceHit[] => walk(schema, value, [], {});

export const collectEntityAttributeReferences = (
  protocol: unknown,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferencesFromSchema(
    CurrentProtocolSchema as unknown as z.ZodType,
    protocol,
  );
