import { type z } from 'zod';
import type * as core from 'zod/v4/core';

import { CurrentProtocolSchema } from '../schemas';
import type { StageSubject } from '../schemas/8/common';
import {
  getEntityAttributeReferenceDescriptor,
  type SubjectResolution,
} from '../schemas/8/entity-attribute-reference';
import { getEntityTypeReferenceDescriptor } from '../schemas/8/entity-type-reference';
import type { VariableType } from '../schemas/8/variables/types';

export type EntityAttributeReferenceHit = {
  path: (string | number)[];
  variableId: string;
  subject?: StageSubject;
  requireType?: readonly VariableType[];
};

export type EntityTypeReferenceHit = {
  path: (string | number)[];
  typeId: string;
  entity: 'node' | 'edge';
};

// One walk collects both reference kinds; the public collectors filter.
type ReferenceHit =
  | ({ kind: 'attribute' } & EntityAttributeReferenceHit)
  | ({ kind: 'type' } & EntityTypeReferenceHit);

type WalkContext = {
  stageSubject?: StageSubject;
  parent?: Record<string, unknown>;
  // The `type` of the nearest enclosing filter rule, for resolving the rule's
  // options.type entity ('ego' rules reference no codebook type).
  filterRuleEntity?: 'node' | 'edge';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Peel optional / nullable / default wrappers to reach the meaningful node.
// A pipe (loose-shape-with-refine piped into a narrowing union) is peeled to
// its INPUT side: it carries the same reference tags at the same paths as the
// union branches, and — being the permissive stage — still matches in-progress
// edits that the narrowed union would reject.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    const type = current._zod.def.type;
    if (type === 'optional' || type === 'nullable' || type === 'default') {
      current = (current._zod.def as core.$ZodOptionalDef)
        .innerType as z.ZodType;
      continue;
    }
    if (type === 'pipe') {
      current = (current._zod.def as core.$ZodPipeDef).in as z.ZodType;
      continue;
    }
    return current;
  }
};

// Memoised: does this schema's subtree contain any entity-attribute or
// entity-type reference? The protocol schema is static, so each node is
// analysed once and the walker can skip the large reference-free regions (UI
// config, text, assets, network data) without descending into them or running
// safeParse on union branches.
const subtreeHasReference = new WeakMap<z.ZodType, boolean>();
const hasReference = (schema: z.ZodType): boolean => {
  const node = unwrap(schema);
  const cached = subtreeHasReference.get(node);
  if (cached !== undefined) return cached;
  // Provisional false guards against schema cycles while computing.
  subtreeHasReference.set(node, false);
  const def = node._zod.def;
  let result =
    getEntityAttributeReferenceDescriptor(node) !== undefined ||
    getEntityTypeReferenceDescriptor(node) !== undefined;
  if (!result) {
    switch (def.type) {
      case 'object':
        result = Object.values((def as core.$ZodObjectDef).shape).some(
          (child) => hasReference(child as z.ZodType),
        );
        break;
      case 'array':
        result = hasReference((def as core.$ZodArrayDef).element as z.ZodType);
        break;
      case 'record':
        result = hasReference(
          (def as core.$ZodRecordDef).valueType as z.ZodType,
        );
        break;
      case 'union':
        result = ((def as core.$ZodUnionDef).options as z.ZodType[]).some(
          (option) => hasReference(option),
        );
        break;
      default:
        result = false;
    }
  }
  subtreeHasReference.set(node, result);
  return result;
};

// Literal/enum values a schema node accepts, for virtual-discriminator detection.
const literalValuesOf = (schema: z.ZodType): unknown[] | undefined => {
  const def = unwrap(schema)._zod.def;
  if (def.type === 'literal') {
    return (def as core.$ZodLiteralDef<core.util.Literal>).values as unknown[];
  }
  if (def.type === 'enum') {
    return Object.values((def as core.$ZodEnumDef).entries);
  }
  return undefined;
};

type VirtualDiscriminator = { field: string; map: Map<unknown, z.ZodType[]> };

// A plain union of object branches is often discriminable by a field that is a
// literal/enum in every branch (e.g. a variable's `type`), even when it is not a
// formal discriminatedUnion (the variable union collides — `boolean`/`datetime`
// map to two branches each). Memoised per union: maps each discriminator value to
// the branches that accept it, so the walker can probe only those.
const virtualDiscriminatorCache = new WeakMap<
  z.ZodType,
  VirtualDiscriminator | null
>();
const getVirtualDiscriminator = (
  union: z.ZodType,
  options: z.ZodType[],
): VirtualDiscriminator | null => {
  const cached = virtualDiscriminatorCache.get(union);
  if (cached !== undefined) return cached;
  const shapes = options.map((option) => {
    const def = unwrap(option)._zod.def;
    return def.type === 'object'
      ? ((def as core.$ZodObjectDef).shape as Record<string, z.ZodType>)
      : undefined;
  });
  let result: VirtualDiscriminator | null = null;
  if (shapes.every((shape) => shape !== undefined)) {
    for (const field of Object.keys(shapes[0] ?? {})) {
      const map = new Map<unknown, z.ZodType[]>();
      const usable = shapes.every((shape, index) => {
        const fieldSchema = shape?.[field];
        const values = fieldSchema ? literalValuesOf(fieldSchema) : undefined;
        if (!values?.length) return false;
        for (const value of values) {
          const branches = map.get(value) ?? [];
          branches.push(options[index] as z.ZodType);
          map.set(value, branches);
        }
        return true;
      });
      if (usable) {
        result = { field, map };
        break;
      }
    }
  }
  virtualDiscriminatorCache.set(union, result);
  return result;
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

// A filter rule is { type: 'node' | 'edge' | 'ego', id, options }; its type
// field names the codebook the rule's options.type id lives in.
const filterRuleEntityOf = (
  value: Record<string, unknown>,
): 'node' | 'edge' | undefined => {
  if (!isRecord(value.options)) return undefined;
  if (value.type === 'node' || value.type === 'edge') return value.type;
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
): ReferenceHit[] => {
  if (value === undefined || value === null) return [];
  const node = unwrap(schema);
  // Prune reference-free subtrees: nothing below can produce a hit.
  if (!hasReference(node)) return [];
  const def = node._zod.def;

  switch (def.type) {
    case 'string': {
      if (typeof value !== 'string') return [];
      const attributeDescriptor = getEntityAttributeReferenceDescriptor(node);
      if (attributeDescriptor) {
        return [
          {
            kind: 'attribute',
            path,
            variableId: value,
            subject: resolveSubject(attributeDescriptor.subject, path, ctx),
            requireType: attributeDescriptor.requireType,
          },
        ];
      }
      const typeDescriptor = getEntityTypeReferenceDescriptor(node);
      if (typeDescriptor) {
        const entity =
          typeDescriptor.entity === 'filterRule'
            ? ctx.filterRuleEntity
            : typeDescriptor.entity;
        // Unresolvable (e.g. an ego filter rule) references no codebook type.
        if (entity === undefined) return [];
        return [{ kind: 'type', path, typeId: value, entity }];
      }
      return [];
    }
    case 'object': {
      if (!isRecord(value)) return [];
      const shape = (def as core.$ZodObjectDef).shape;
      const childCtx: WalkContext = {
        stageSubject: stageSubjectOf(value) ?? ctx.stageSubject,
        parent: value,
        filterRuleEntity: filterRuleEntityOf(value) ?? ctx.filterRuleEntity,
      };
      return Object.keys(shape).flatMap((key) => {
        const child = shape[key] as z.ZodType;
        if (!hasReference(child)) return [];
        return walk(child, value[key], [...path, key], childCtx);
      });
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
      const unionDef = def as
        | core.$ZodDiscriminatedUnionDef
        | core.$ZodUnionDef;
      const options = unionDef.options as z.ZodType[];
      const discriminator =
        'discriminator' in unionDef ? unionDef.discriminator : undefined;
      if (discriminator !== undefined && isRecord(value)) {
        const discValue = value[discriminator];
        const match = options.find((option) => {
          const shape = (option._zod.def as core.$ZodObjectDef).shape;
          const discField = shape[discriminator] as z.ZodType | undefined;
          if (!discField) return false;
          const literalValues = (
            discField._zod.def as core.$ZodLiteralDef<core.util.Literal>
          ).values;
          return (
            Array.isArray(literalValues) &&
            literalValues.includes(discValue as core.util.Literal)
          );
        });
        return match ? walk(match, value, path, ctx) : [];
      }
      // plain union: only reference-bearing branches can yield hits, so restrict
      // both the branch search and safeParse cost to them (the top-level guard
      // guarantees at least one such branch exists). Prefer the branch that
      // fully parses — unchanged behaviour for valid data.
      const refOptions = options.filter((option) => hasReference(option));
      // Narrow the branch search with a virtual discriminator — a literal/enum
      // field every option shares (e.g. a variable's `type`). This restricts the
      // safeParse probes to the branches whose discriminator matches the value
      // (usually one) instead of every reference-bearing branch.
      const virtualDiscriminator = getVirtualDiscriminator(node, options);
      const discriminated =
        virtualDiscriminator && isRecord(value)
          ? virtualDiscriminator.map.get(value[virtualDiscriminator.field])
          : undefined;
      const searchOptions = discriminated
        ? discriminated.filter((option) => hasReference(option))
        : refOptions;
      const match = searchOptions.find(
        (option) => option.safeParse(value).success,
      );
      if (match) return walk(match, value, path, ctx);
      // No reference-bearing branch matched. If the value validly belongs to a
      // reference-free branch there is nothing to collect; only when it matches
      // no branch at all (structurally-invalid, in-progress edit) do we merge
      // references across the reference-bearing branches so they still surface.
      const matchesRefFreeBranch = options.some(
        (option) => !hasReference(option) && option.safeParse(value).success,
      );
      if (matchesRefFreeBranch) return [];
      // De-dupe on the full hit (path AND resolved subject/requireType): two
      // branches can expose the same path with different validation metadata,
      // and those are distinct references that must both survive.
      const merged = new Map<string, ReferenceHit>();
      for (const option of refOptions) {
        for (const hit of walk(option, value, path, ctx)) {
          merged.set(JSON.stringify(hit), hit);
        }
      }
      return [...merged.values()];
    }
    default:
      return [];
  }
};

const isAttributeHit = (
  hit: ReferenceHit,
): hit is { kind: 'attribute' } & EntityAttributeReferenceHit =>
  hit.kind === 'attribute';

const isTypeHit = (
  hit: ReferenceHit,
): hit is { kind: 'type' } & EntityTypeReferenceHit => hit.kind === 'type';

export const collectEntityAttributeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityAttributeReferenceHit[] =>
  walk(schema, value, [], {})
    .filter(isAttributeHit)
    .map(({ kind: _kind, ...hit }) => hit);

export const collectEntityAttributeReferences = (
  protocol: unknown,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferencesFromSchema(
    CurrentProtocolSchema as unknown as z.ZodType,
    protocol,
  );

/**
 * Every codebook node/edge TYPE referenced by a protocol, discovered from the
 * schema's `entityTypeReference` tags — the entity-type counterpart of
 * `collectEntityAttributeReferences`. Covers stage subjects (including the
 * NetworkComposer's per-edge-type entries), edge creation/display prompt
 * settings, the FamilyPedigree node/edge configs, and filter rules.
 */
export const collectEntityTypeReferences = (
  protocol: unknown,
): EntityTypeReferenceHit[] =>
  walk(CurrentProtocolSchema as unknown as z.ZodType, protocol, [], {})
    .filter(isTypeHit)
    .map(({ kind: _kind, ...hit }) => hit);
