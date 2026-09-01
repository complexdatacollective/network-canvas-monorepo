import { z } from 'zod';

import { getAssetReferenceDescriptor } from '../schemas/8/asset-reference.ts';
import type { StageSubject } from '../schemas/8/common/index.ts';
import {
  getEntityAttributeReferenceDescriptor,
  type AttributeExistence,
  type AttributeWriterUsage,
  type ExclusiveSlotDescriptor,
  type InterfaceOwnedOptionSetKey,
  type SubjectResolution,
} from '../schemas/8/entity-attribute-reference.ts';
import { getEntityTypeReferenceDescriptor } from '../schemas/8/entity-type-reference.ts';
// The CURRENT protocol schema, imported from its own module rather than
// through `../schemas/index.ts`. This module and the schema module are
// mutually recursive, and `../schemas/index.ts` sits in the middle: it
// evaluates `const CurrentProtocolSchema = ProtocolSchemaV8` at module scope,
// which under that cycle runs before the schema module has finished
// initialising. Importing the schema module directly gives a live binding
// resolved at call time instead, so the walk works whichever module the
// consumer entered through.
import CurrentProtocolSchema from '../schemas/8/schema.ts';
import {
  getStageSubjectResolution,
  resolveDeclaredStageSubject,
} from '../schemas/8/stage-subject-resolution.ts';
import type { VariableType } from '../schemas/8/variables/types.ts';

export type EntityAttributeReferenceHit = {
  path: (string | number)[];
  variableId: string;
  subject?: StageSubject;
  requireType?: readonly VariableType[];
  /** See `AttributeExistence`; absent means the attribute must exist. */
  existence?: AttributeExistence;
  usage?: AttributeWriterUsage;
  exclusive?: ExclusiveSlotDescriptor;
  ownedOptions?: InterfaceOwnedOptionSetKey;
};

export type EntityTypeReferenceHit = {
  path: (string | number)[];
  typeId: string;
  entity: 'node' | 'edge';
};

export type AssetReferenceHit = {
  path: (string | number)[];
  assetId: string;
};

// One walk collects every reference kind; the public collectors filter.
type ReferenceHit =
  | ({ kind: 'attribute' } & EntityAttributeReferenceHit)
  | ({ kind: 'type' } & EntityTypeReferenceHit)
  | ({ kind: 'asset' } & AssetReferenceHit);

type WalkContext = {
  stageSubject?: StageSubject;
  parent?: Record<string, unknown>;
  // The `type` of the nearest enclosing filter rule, for resolving the rule's
  // options.type entity ('ego' rules reference no codebook type).
  filterRuleEntity?: 'node' | 'edge';
  // The protocol's stages, for a stage whose subject is declared on ANOTHER
  // stage (NarrativePedigree). Empty when the walk was entered on a schema
  // fragment rather than a whole protocol.
  stages: readonly unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Zod types its child accessors (`.unwrap()`, `.in`, `.element`, `.valueType`,
// `.options`, `.shape`) against the structural schema type, which lacks the
// `.meta()` / `.safeParse()` surface this walk uses; instanceof recovers it.
const isZodType = (value: unknown): value is z.ZodType =>
  value instanceof z.ZodType;

// Peel optional / nullable / default wrappers to reach the meaningful node.
// A pipe (loose-shape-with-refine piped into a narrowing union) is peeled to
// its INPUT side: it carries the same reference tags at the same paths as the
// union branches, and — being the permissive stage — still matches in-progress
// edits that the narrowed union would reject.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    const inner =
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
        ? current.unwrap()
        : current instanceof z.ZodPipe
          ? current.in
          : undefined;
    if (!isZodType(inner)) return current;
    current = inner;
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
  let result =
    getEntityAttributeReferenceDescriptor(node) !== undefined ||
    getEntityTypeReferenceDescriptor(node) !== undefined ||
    getAssetReferenceDescriptor(node) !== undefined;
  if (!result) {
    if (node instanceof z.ZodObject) {
      result = Object.values(node.shape).some(
        (child: unknown) => isZodType(child) && hasReference(child),
      );
    } else if (node instanceof z.ZodArray) {
      const element = node.element;
      result = isZodType(element) && hasReference(element);
    } else if (node instanceof z.ZodRecord) {
      const valueType = node.valueType;
      result = isZodType(valueType) && hasReference(valueType);
    } else if (node instanceof z.ZodUnion) {
      result = node.options.some(
        (option) => isZodType(option) && hasReference(option),
      );
    }
  }
  subtreeHasReference.set(node, result);
  return result;
};

// Literal/enum values a schema node accepts, for virtual-discriminator detection.
const literalValuesOf = (schema: z.ZodType): unknown[] | undefined => {
  const node = unwrap(schema);
  if (node instanceof z.ZodLiteral) return [...node.values];
  if (node instanceof z.ZodEnum) return node.options;
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
    const node = unwrap(option);
    return node instanceof z.ZodObject ? node.shape : undefined;
  });
  let result: VirtualDiscriminator | null = null;
  if (shapes.every((shape) => shape !== undefined)) {
    for (const field of Object.keys(shapes[0] ?? {})) {
      const map = new Map<unknown, z.ZodType[]>();
      const usable = options.every((option, index) => {
        const fieldSchema: unknown = shapes[index]?.[field];
        const values = isZodType(fieldSchema)
          ? literalValuesOf(fieldSchema)
          : undefined;
        if (!values?.length) return false;
        for (const value of values) {
          const branches = map.get(value) ?? [];
          branches.push(option);
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

/**
 * The subject a stage establishes for the `stageSubject`-resolved references
 * inside it. A stage that carries a literal `subject` needs no declaration;
 * one that identifies its subject some other way declares it on its own schema
 * (see `stage-subject-resolution.ts`), which is the ONLY other source. Nothing
 * downstream re-derives a subject from stage shape, so a hit either leaves the
 * walk with the right subject or with none.
 */
const stageSubjectOf = (
  node: z.ZodType,
  value: Record<string, unknown>,
  ctx: WalkContext,
): StageSubject | undefined => {
  const declared = getStageSubjectResolution(node);
  if (declared) {
    return resolveDeclaredStageSubject(declared, value, ctx.stages);
  }
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

  if (node instanceof z.ZodString) {
    if (typeof value !== 'string') return [];
    const attributeDescriptor = getEntityAttributeReferenceDescriptor(node);
    if (attributeDescriptor) {
      // A magic key (the `'*'` nomination-order sort property) occupies a
      // reference site without being one. Emitting a hit would put it in every
      // usage index as a variable id that no codebook can ever contain.
      if (attributeDescriptor.ignoreValues?.includes(value)) return [];
      // A conditional writer (see `usageRequiresSibling`) is a write only in
      // the configuration that turns the write on; in every other it is a
      // read, and the hit must not carry a `usage` that would make the
      // exclusive-slot and variable-role rules treat it as a second writer.
      const gate = attributeDescriptor.usageRequiresSibling;
      const writes = gate === undefined || ctx.parent?.[gate] === true;
      return [
        {
          kind: 'attribute',
          path,
          variableId: value,
          subject: resolveSubject(attributeDescriptor.subject, path, ctx),
          requireType: attributeDescriptor.requireType,
          existence: attributeDescriptor.existence,
          usage: writes ? attributeDescriptor.usage : undefined,
          exclusive: attributeDescriptor.exclusive,
          ownedOptions: attributeDescriptor.ownedOptions,
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
    const assetDescriptor = getAssetReferenceDescriptor(node);
    if (assetDescriptor) {
      // A sentinel occupying an asset site without being one (a panel's
      // `'existing'`). Emitting a hit would put it in every usage index as an
      // asset id no manifest can ever contain.
      if (assetDescriptor.ignoreValues?.includes(value)) return [];
      return [{ kind: 'asset', path, assetId: value }];
    }
    return [];
  }

  if (node instanceof z.ZodObject) {
    if (!isRecord(value)) return [];
    const shape = node.shape;
    const childCtx: WalkContext = {
      stageSubject: stageSubjectOf(node, value, ctx) ?? ctx.stageSubject,
      parent: value,
      filterRuleEntity: filterRuleEntityOf(value) ?? ctx.filterRuleEntity,
      stages: ctx.stages,
    };
    return Object.keys(shape).flatMap((key) => {
      const child: unknown = shape[key];
      if (!isZodType(child) || !hasReference(child)) return [];
      return walk(child, value[key], [...path, key], childCtx);
    });
  }

  if (node instanceof z.ZodArray) {
    if (!Array.isArray(value)) return [];
    const element = node.element;
    if (!isZodType(element)) return [];
    return value.flatMap((item, index) =>
      walk(element, item, [...path, index], ctx),
    );
  }

  if (node instanceof z.ZodRecord) {
    if (!isRecord(value)) return [];
    const valueType = node.valueType;
    if (!isZodType(valueType)) return [];
    return Object.keys(value).flatMap((key) =>
      walk(valueType, value[key], [...path, key], ctx),
    );
  }

  if (node instanceof z.ZodUnion) {
    const options = node.options.filter(isZodType);
    if (node instanceof z.ZodDiscriminatedUnion && isRecord(value)) {
      const discriminator = node.def.discriminator;
      const discValue = value[discriminator];
      const match = options.find((option) => {
        if (!(option instanceof z.ZodObject)) return false;
        const discField: unknown = option.shape[discriminator];
        if (!(discField instanceof z.ZodLiteral)) return false;
        const accepted: ReadonlySet<unknown> = discField.values;
        return accepted.has(discValue);
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

  return [];
};

const isAttributeHit = (
  hit: ReferenceHit,
): hit is { kind: 'attribute' } & EntityAttributeReferenceHit =>
  hit.kind === 'attribute';

const isTypeHit = (
  hit: ReferenceHit,
): hit is { kind: 'type' } & EntityTypeReferenceHit => hit.kind === 'type';

const isAssetHit = (
  hit: ReferenceHit,
): hit is { kind: 'asset' } & AssetReferenceHit => hit.kind === 'asset';

/**
 * The walk's root context. `stages` is seeded from the value being walked so a
 * stage whose subject lives on another stage (NarrativePedigree) can resolve
 * it; walking a schema fragment simply leaves it empty.
 */
const rootContext = (value: unknown): WalkContext => ({
  stages: isRecord(value) && Array.isArray(value.stages) ? value.stages : [],
});

export const collectEntityAttributeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityAttributeReferenceHit[] =>
  walk(schema, value, [], rootContext(value))
    .filter(isAttributeHit)
    .map(({ kind: _kind, ...hit }) => hit);

export const collectEntityAttributeReferences = (
  protocol: unknown,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferencesFromSchema(CurrentProtocolSchema, protocol);

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
  walk(CurrentProtocolSchema, protocol, [], rootContext(protocol))
    .filter(isTypeHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * Every `assetManifest` entry referenced by a protocol, discovered from the
 * schema's `assetReference` tags — the asset counterpart of
 * `collectEntityAttributeReferences`. Covers name generator and panel data
 * sources, sociogram/narrative background images, the Geospatial map's token
 * and data-source assets, and Information / FamilyPedigree intro-screen asset
 * items.
 *
 * Consumers that need to know whether an asset is in use must derive it from
 * here rather than keeping their own list of paths: a stage type that gains an
 * asset field is then covered the moment its schema is tagged, instead of
 * silently reporting a used asset as unused (and offering to delete it).
 */
export const collectAssetReferences = (
  protocol: unknown,
): AssetReferenceHit[] =>
  walk(CurrentProtocolSchema, protocol, [], rootContext(protocol))
    .filter(isAssetHit)
    .map(({ kind: _kind, ...hit }) => hit);
