import { z } from 'zod';

import { assetBlocksInMessage } from '../localization/assetBlock.ts';
import {
  type AssetReferenceDescriptor,
  getAssetReferenceDescriptor,
} from '../schemas/9/asset-reference.ts';
import {
  resolveSubjectValue,
  type ResolvedSubject,
} from '../schemas/9/common/subjects.ts';
import {
  type DynamicValueRole,
  dynamicValueReferencesIn,
  optionIdFromCaseKey,
} from '../schemas/9/dynamic-values.ts';
import {
  getEntityAttributeReferenceDescriptor,
  type AttributeExistence,
  type EntityAttributeReferenceDescriptor,
  type AttributeWriterUsage,
  type ExclusiveSlotDescriptor,
  type InterfaceOwnedOptionSetKey,
  type StageManagedOptionsDescriptor,
  type SubjectResolution,
} from '../schemas/9/entity-attribute-reference.ts';
import {
  type EntityTypeReferenceDescriptor,
  getEntityTypeReferenceDescriptor,
} from '../schemas/9/entity-type-reference.ts';
import { getLocalizedStringDescriptor } from '../schemas/9/localized-string.ts';
import {
  getProtocolObjectKind,
  type ProtocolObjectKind,
} from '../schemas/9/protocol-object-id.ts';
import { getStageReferenceSite } from '../schemas/9/stage-reference.ts';
import {
  getStageSubjectResolution,
  resolveDeclaredStageSubject,
  type StageSubjectResolution,
} from '../schemas/9/stage-subject-resolution.ts';
import type { VariableType } from '../schemas/9/variables/types.ts';

export type EntityAttributeReferenceHit = {
  path: (string | number)[];
  variableId: string;
  subject?: ResolvedSubject;
  requireType?: readonly VariableType[];
  /** See `AttributeExistence`; absent means the attribute must exist. */
  existence?: AttributeExistence;
  usage?: AttributeWriterUsage;
  exclusive?: ExclusiveSlotDescriptor;
  ownedOptions?: InterfaceOwnedOptionSetKey;
  stageManagedOptions?: StageManagedOptionsDescriptor;
  /** See `dataSourceColumn` on the reference descriptor. */
  dataSourceColumn?: true;
  /**
   * Set when the attribute is named inside text that shows dynamic values
   * (see `dynamicValueNameFor`), rather than being the whole of the field at
   * `path`, which is then the translation that names it: `name` is the name
   * the text uses, and `optionIds` the options it gives a version for. Text
   * can name several attributes, so two hits may share a path.
   */
  inMessage?: Readonly<{ name: string; optionIds: readonly string[] }>;
};

export type EntityTypeReferenceHit = {
  path: (string | number)[];
  typeId: string;
  entity: 'node' | 'edge';
};

export type AssetReferenceHit = {
  /**
   * The field holding the id, or, for a file shown as a block in text, the
   * translation that names it. Text can name several files, so two hits may
   * share a path.
   */
  path: (string | number)[];
  assetId: string;
};

export type StageReferenceHit = {
  path: (string | number)[];
  stageId: string;
  /** The declared site this hit came from; see `stageReference`. */
  site: string;
};

/**
 * A marked object (see `protocolObjectId`). `path` is the path of its `id`
 * field, and `id` is undefined when the object has no string id.
 */
export type ProtocolObjectIdHit = {
  path: (string | number)[];
  id: string | undefined;
  objectKind: ProtocolObjectKind;
};

// One walk collects every reference kind; the public collectors filter.
export type ReferenceHit =
  | ({ kind: 'attribute' } & EntityAttributeReferenceHit)
  | ({ kind: 'type' } & EntityTypeReferenceHit)
  | ({ kind: 'asset' } & AssetReferenceHit)
  | ({ kind: 'stage' } & StageReferenceHit)
  | ({ kind: 'objectId' } & ProtocolObjectIdHit);

type WalkContext = {
  stageSubject?: ResolvedSubject;
  parent?: Record<string, unknown>;
  // The `type` of the nearest enclosing filter rule, for resolving the rule's
  // options.type entity ('ego' rules reference no codebook type).
  filterRuleEntity?: 'node' | 'edge';
  // The protocol's stages, for a stage whose subject is declared on ANOTHER
  // stage (NarrativePedigree). Empty when the walk was entered on a schema
  // fragment rather than a whole protocol.
  stages: readonly unknown[];
  readAssetBlocks: boolean;
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

// Localized text declared to hold files as blocks names each file it shows
// inside its markdown (see `AssetBlock`), so it is an asset reference site
// with no field of its own.
const holdsAssetBlocks = (node: z.ZodType): boolean =>
  getLocalizedStringDescriptor(node)?.assetBlocks === true;
// Text that shows dynamic values names the attributes it shows inside its
// messages (see `dynamicValueNameFor`).
const dynamicValueSiteOf = (node: z.ZodType) =>
  getLocalizedStringDescriptor(node)?.dynamicValues;
const hasReference = (schema: z.ZodType): boolean => {
  const node = unwrap(schema);
  const cached = subtreeHasReference.get(node);
  if (cached !== undefined) return cached;
  // Provisional false guards against schema cycles while computing.
  subtreeHasReference.set(node, false);
  let result =
    getEntityAttributeReferenceDescriptor(node) !== undefined ||
    getEntityTypeReferenceDescriptor(node) !== undefined ||
    getAssetReferenceDescriptor(node) !== undefined ||
    holdsAssetBlocks(node) ||
    dynamicValueSiteOf(node) !== undefined ||
    getStageReferenceSite(node) !== undefined ||
    getProtocolObjectKind(node) !== undefined;
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
  declared: StageSubjectResolution | undefined,
  value: Record<string, unknown>,
  ctx: WalkContext,
): ResolvedSubject | undefined => {
  if (declared) {
    return resolveDeclaredStageSubject(declared, value, ctx.stages);
  }
  return resolveSubjectValue(value.subject);
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
): ResolvedSubject | undefined => {
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

/**
 * The entity a dynamic value's role reads an attribute of, on a stage whose
 * subject is `stageSubject`: the participant for `ego`, the stage's edge type
 * for `edge`, and its node type for every role about a person. A role the
 * stage's subject cannot supply resolves to nothing; the dynamic value checks
 * report that at each site that uses it.
 */
const dynamicValueSubject = (
  role: DynamicValueRole,
  stageSubject: ResolvedSubject | undefined,
): ResolvedSubject | undefined => {
  if (role === 'ego') return { entity: 'ego' };
  const entity = role === 'edge' ? 'edge' : 'node';
  return stageSubject?.entity === entity ? stageSubject : undefined;
};

type StringPlan = {
  kind: 'string';
  node: z.ZodString;
  attribute: EntityAttributeReferenceDescriptor | undefined;
  type: EntityTypeReferenceDescriptor | undefined;
  asset: AssetReferenceDescriptor | undefined;
  stageSite: string | undefined;
};

type ObjectPlan = {
  kind: 'object';
  // Only the fields whose subtree can hold a reference, in shape order.
  fields: (readonly [string, z.ZodType])[];
  objectKind: ProtocolObjectKind | undefined;
  subjectResolution: StageSubjectResolution | undefined;
};

type UnionPlan = {
  kind: 'union';
  // A discriminated union's branch for each discriminator value: the first
  // object branch whose discriminator accepts it.
  discriminated:
    | { discriminator: string; branches: Map<unknown, z.ZodType> }
    | undefined;
  // A plain union's reference-bearing branches for each value of its virtual
  // discriminator (see `getVirtualDiscriminator`).
  virtual: { field: string; branches: Map<unknown, z.ZodType[]> } | undefined;
  refOptions: z.ZodType[];
  refFreeOptions: z.ZodType[];
};

// What the walk does at a schema node, worked out once per node from its
// wrappers, class and metadata. Reading zod metadata and running zod's
// `instanceof` checks at every node of every walk was most of a walk's cost.
type WalkPlan =
  | { kind: 'none' }
  | TextPlan
  | StringPlan
  | ObjectPlan
  | { kind: 'array'; element: z.ZodType }
  | { kind: 'record'; valueType: z.ZodType }
  | UnionPlan;

// Localized text that names files it shows as blocks, or attributes it
// shows as dynamic values, inside its translations.
type TextPlan = {
  kind: 'text';
  assetBlocks: boolean;
  dynamicValues: boolean;
};

const NO_PLAN: WalkPlan = { kind: 'none' };

const unionPlan = (node: z.ZodUnion): UnionPlan => {
  const options = node.options.filter(isZodType);
  let discriminated: UnionPlan['discriminated'];
  if (node instanceof z.ZodDiscriminatedUnion) {
    const discriminator = node.def.discriminator;
    const branches = new Map<unknown, z.ZodType>();
    for (const option of options) {
      if (!(option instanceof z.ZodObject)) continue;
      const discField: unknown = option.shape[discriminator];
      if (!isZodType(discField)) continue;
      for (const value of literalValuesOf(discField) ?? []) {
        if (!branches.has(value)) branches.set(value, option);
      }
    }
    discriminated = { discriminator, branches };
  }
  const virtualDiscriminator = getVirtualDiscriminator(node, options);
  return {
    kind: 'union',
    discriminated,
    virtual: virtualDiscriminator
      ? {
          field: virtualDiscriminator.field,
          branches: new Map(
            [...virtualDiscriminator.map].map(([value, branches]) => [
              value,
              branches.filter((option) => hasReference(option)),
            ]),
          ),
        }
      : undefined,
    refOptions: options.filter((option) => hasReference(option)),
    refFreeOptions: options.filter((option) => !hasReference(option)),
  };
};

const buildPlan = (schema: z.ZodType): WalkPlan => {
  const node = unwrap(schema);
  // Prune reference-free subtrees: nothing below can produce a hit.
  if (!hasReference(node)) return NO_PLAN;
  if (node instanceof z.ZodString) {
    return {
      kind: 'string',
      node,
      attribute: getEntityAttributeReferenceDescriptor(node),
      type: getEntityTypeReferenceDescriptor(node),
      asset: getAssetReferenceDescriptor(node),
      stageSite: getStageReferenceSite(node),
    };
  }
  const assetBlocks = holdsAssetBlocks(node);
  const dynamicValues = dynamicValueSiteOf(node) !== undefined;
  if (assetBlocks || dynamicValues) {
    return { kind: 'text', assetBlocks, dynamicValues };
  }
  if (node instanceof z.ZodObject) {
    const shape = node.shape;
    const fields = Object.keys(shape).flatMap((key) => {
      const child: unknown = shape[key];
      return isZodType(child) && hasReference(child)
        ? [[key, child] as const]
        : [];
    });
    const idSchema: unknown = shape.id;
    return {
      kind: 'object',
      fields,
      objectKind: isZodType(idSchema)
        ? getProtocolObjectKind(unwrap(idSchema))
        : undefined,
      subjectResolution: getStageSubjectResolution(node),
    };
  }
  if (node instanceof z.ZodArray) {
    const element = node.element;
    return isZodType(element) ? { kind: 'array', element } : NO_PLAN;
  }
  if (node instanceof z.ZodRecord) {
    const valueType = node.valueType;
    return isZodType(valueType) ? { kind: 'record', valueType } : NO_PLAN;
  }
  if (node instanceof z.ZodUnion) return unionPlan(node);
  return NO_PLAN;
};

const walkPlans = new WeakMap<z.ZodType, WalkPlan>();
const planFor = (schema: z.ZodType): WalkPlan => {
  const cached = walkPlans.get(schema);
  if (cached !== undefined) return cached;
  const plan = buildPlan(schema);
  walkPlans.set(schema, plan);
  return plan;
};

const walkString = (
  plan: StringPlan,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): ReferenceHit[] => {
  if (typeof value !== 'string') return [];
  const attributeDescriptor = plan.attribute;
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
        stageManagedOptions: attributeDescriptor.stageManagedOptions,
        dataSourceColumn: attributeDescriptor.dataSourceColumn,
      },
    ];
  }
  const typeDescriptor = plan.type;
  if (typeDescriptor) {
    const entity =
      typeDescriptor.entity === 'filterRule'
        ? ctx.filterRuleEntity
        : typeDescriptor.entity;
    // Unresolvable (e.g. an ego filter rule) references no codebook type.
    if (entity === undefined) return [];
    return [{ kind: 'type', path, typeId: value, entity }];
  }
  const assetDescriptor = plan.asset;
  if (assetDescriptor) {
    // The walker tolerates invalid partial documents, but only a value that
    // satisfies its tagged field schema can name a manifest dependency.
    if (!plan.node.safeParse(value).success) return [];
    // A sentinel occupying an asset site without being one (a panel's
    // `'existing'`). Emitting a hit would put it in every usage index as an
    // asset id no manifest can ever contain.
    if (assetDescriptor.ignoreValues?.includes(value)) return [];
    return [{ kind: 'asset', path, assetId: value }];
  }
  if (plan.stageSite !== undefined) {
    return [{ kind: 'stage', path, stageId: value, site: plan.stageSite }];
  }
  return [];
};

/**
 * The attributes text that shows dynamic values names, each a use of that
 * attribute, so that deleting it is blocked like deleting any other
 * attribute in use. Every translation is read. A name of a node type's own
 * label is about a node of that type, which the codebook path names; any
 * other is a stage's. Existence is checked where the text is, with the rest
 * of what it shows (`findDynamicValueProblems`).
 */
const dynamicTextHits = (
  locale: string,
  message: string,
  path: (string | number)[],
  ctx: WalkContext,
): ReferenceHit[] =>
  dynamicValueReferencesIn(message).flatMap(
    ({ name, parsed, caseKeys }): ReferenceHit[] => {
      if (parsed?.kind !== 'attribute') return [];
      const hitPath = [...path, locale];
      return [
        {
          kind: 'attribute',
          path: hitPath,
          variableId: parsed.variableId,
          subject:
            resolveSubject('owningVariable', hitPath, ctx) ??
            dynamicValueSubject(parsed.role, ctx.stageSubject),
          existence: 'unchecked',
          inMessage: {
            name,
            optionIds: caseKeys.flatMap((key) => {
              const optionId = optionIdFromCaseKey(key);
              return optionId === undefined ? [] : [optionId];
            }),
          },
        },
      ];
    },
  );

const walkText = (
  plan: TextPlan,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): ReferenceHit[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([locale, message]): ReferenceHit[] => {
    if (typeof message !== 'string') return [];
    const values = plan.dynamicValues
      ? dynamicTextHits(locale, message, path, ctx)
      : [];
    // Every translation is read: each is a text some participant is shown,
    // and a file only one language shows is still in use.
    const assets =
      plan.assetBlocks && ctx.readAssetBlocks
        ? assetBlocksInMessage(message).flatMap(({ block }): ReferenceHit[] =>
            block.assetId === ''
              ? []
              : [
                  {
                    kind: 'asset',
                    path: [...path, locale],
                    assetId: block.assetId,
                  },
                ],
          )
        : [];
    return [...values, ...assets];
  });
};

const walkUnion = (
  plan: UnionPlan,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): ReferenceHit[] => {
  if (plan.discriminated && isRecord(value)) {
    const match = plan.discriminated.branches.get(
      value[plan.discriminated.discriminator],
    );
    return match ? walk(match, value, path, ctx) : [];
  }
  // plain union: only reference-bearing branches can yield hits, so restrict
  // both the branch search and safeParse cost to them (the top-level guard
  // guarantees at least one such branch exists). Prefer the branch that
  // fully parses — unchanged behaviour for valid data. The virtual
  // discriminator restricts the safeParse probes to the branches whose
  // discriminator matches the value (usually one).
  const discriminated =
    plan.virtual && isRecord(value)
      ? plan.virtual.branches.get(value[plan.virtual.field])
      : undefined;
  const searchOptions = discriminated ?? plan.refOptions;
  const match = searchOptions.find((option) => option.safeParse(value).success);
  if (match) return walk(match, value, path, ctx);
  // No reference-bearing branch matched. If the value validly belongs to a
  // reference-free branch there is nothing to collect; only when it matches
  // no branch at all (structurally-invalid, in-progress edit) do we merge
  // references across the reference-bearing branches so they still surface.
  const matchesRefFreeBranch = plan.refFreeOptions.some(
    (option) => option.safeParse(value).success,
  );
  if (matchesRefFreeBranch) return [];
  // De-dupe on the full hit (path AND resolved subject/requireType): two
  // branches can expose the same path with different validation metadata,
  // and those are distinct references that must both survive. A value whose
  // discriminator names its branches is read only through those: a yes/no
  // variable with an invalid name must not have its options read as a
  // categorical variable's.
  const merged = new Map<string, ReferenceHit>();
  for (const option of searchOptions) {
    for (const hit of walk(option, value, path, ctx)) {
      merged.set(JSON.stringify(hit), hit);
    }
  }
  return [...merged.values()];
};

const walk = (
  schema: z.ZodType,
  value: unknown,
  path: (string | number)[],
  ctx: WalkContext,
): ReferenceHit[] => {
  if (value === undefined || value === null) return [];
  const plan = planFor(schema);
  if (plan.kind === 'none') return [];
  if (plan.kind === 'string') return walkString(plan, value, path, ctx);
  if (plan.kind === 'text') return walkText(plan, value, path, ctx);
  if (plan.kind === 'object') {
    if (!isRecord(value)) return [];
    const childCtx: WalkContext = {
      stageSubject:
        stageSubjectOf(plan.subjectResolution, value, ctx) ?? ctx.stageSubject,
      parent: value,
      filterRuleEntity: filterRuleEntityOf(value) ?? ctx.filterRuleEntity,
      stages: ctx.stages,
      readAssetBlocks: ctx.readAssetBlocks,
    };
    const children = plan.fields.flatMap(([key, child]) =>
      walk(child, value[key], [...path, key], childCtx),
    );
    // The object's own hit precedes its children's, so hits come in
    // document order and the first occurrence of an id is the outermost.
    if (plan.objectKind === undefined) return children;
    const id = typeof value.id === 'string' ? value.id : undefined;
    return [
      {
        kind: 'objectId',
        path: [...path, 'id'],
        id,
        objectKind: plan.objectKind,
      },
      ...children,
    ];
  }
  if (plan.kind === 'array') {
    if (!Array.isArray(value)) return [];
    const { element } = plan;
    return value.flatMap((item, index) =>
      walk(element, item, [...path, index], ctx),
    );
  }
  if (plan.kind === 'record') {
    if (!isRecord(value)) return [];
    const { valueType } = plan;
    return Object.keys(value).flatMap((key) =>
      walk(valueType, value[key], [...path, key], ctx),
    );
  }
  return walkUnion(plan, value, path, ctx);
};

export const isAttributeHit = (
  hit: ReferenceHit,
): hit is { kind: 'attribute' } & EntityAttributeReferenceHit =>
  hit.kind === 'attribute';

export const isTypeHit = (
  hit: ReferenceHit,
): hit is { kind: 'type' } & EntityTypeReferenceHit => hit.kind === 'type';

export const isAssetHit = (
  hit: ReferenceHit,
): hit is { kind: 'asset' } & AssetReferenceHit => hit.kind === 'asset';

export const isStageHit = (
  hit: ReferenceHit,
): hit is { kind: 'stage' } & StageReferenceHit => hit.kind === 'stage';

export const isObjectIdHit = (
  hit: ReferenceHit,
): hit is { kind: 'objectId' } & ProtocolObjectIdHit => hit.kind === 'objectId';

/**
 * Every reference and marked object in `value`, read through `schema`'s
 * metadata. The value may be invalid or partial. `stages` in the walk context
 * is seeded from the value so a stage whose subject lives on another stage
 * (NarrativePedigree) can resolve it; walking a schema fragment leaves it
 * empty.
 *
 * `readAssetBlocks: false` leaves out the files text shows as blocks, which
 * are found by parsing the text's markdown: the costly part of a walk, and
 * not needed by a caller that reads no asset hits.
 */
export const walkSchemaReferences = (
  schema: z.ZodType,
  value: unknown,
  { readAssetBlocks = true }: { readAssetBlocks?: boolean } = {},
): ReferenceHit[] =>
  walk(schema, value, [], {
    stages: isRecord(value) && Array.isArray(value.stages) ? value.stages : [],
    readAssetBlocks,
  });
