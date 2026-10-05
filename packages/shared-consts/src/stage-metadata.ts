import { z } from 'zod';

import { EntityAttributesSchema, VariableValueSchema } from './network.ts';

/**
 * A deliberate copy of `FRAMING_IDS`, whose canonical definition is
 * `packages/protocol-validation/src/schemas/8/family-pedigree-values.ts`.
 *
 * It is copied rather than imported for two reasons. This package must never
 * depend on `@codaco/protocol-validation` — the dependency runs the other way.
 * And this schema describes *persisted session metadata*, which has its own
 * compatibility story: a stored session must keep parsing even if a future
 * protocol schema version revises its framing set, so the two are allowed to
 * diverge and must not be wired together.
 */
const SESSION_FRAMING_IDS = ['gamete', 'gendered'] as const;

const FamilyPedigreeMetadataFields = {
  isNetworkCommitted: z.boolean(),
  // Version 1 records edge ids from the shared Redux network. Older pedigree
  // snapshots omitted this marker and may contain interface-local edge ids.
  edgeIdVersion: z.optional(z.literal(1)),
  selectedFraming: z.optional(z.enum([...SESSION_FRAMING_IDS])),
  noChildrenAffirmed: z.optional(z.boolean()),
  nodes: z.optional(
    z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        isEgo: z.boolean(),
      }),
    ),
  ),
};

const FamilyPedigreeStageMetadataSchema = z.object({
  ...FamilyPedigreeMetadataFields,
  edges: z.optional(
    z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        attributes: EntityAttributesSchema,
      }),
    ),
  ),
});

const StrictFamilyPedigreeStageMetadataSchema = z.object({
  ...FamilyPedigreeMetadataFields,
  edges: z.optional(
    z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        attributes: z.record(z.string(), VariableValueSchema),
      }),
    ),
  ),
});

const DyadCensusMetadataItemSchema = z.tuple([
  z.number(), // prompt index
  z.string(), // entity a
  z.string(), // entity b
  z.boolean(), // is present
]);

export type DyadCensusMetadataItem = z.infer<
  typeof DyadCensusMetadataItemSchema
>;

const DyadCensusStageMetadataSchema = z.array(DyadCensusMetadataItemSchema);

// NetworkComposer persists the participant's live automatic-layout choice here
// (the schema's behaviours.automaticLayout boolean only sets the initial value).
// Storing it in metadata keeps the toggle sticky across navigation.
const NetworkComposerStageMetadataSchema = z.object({
  automaticLayout: z.boolean(),
});

export const StageMetadataSchema = z.record(
  z.string(), // stage ID
  z.union([
    FamilyPedigreeStageMetadataSchema,
    DyadCensusStageMetadataSchema,
    NetworkComposerStageMetadataSchema,
  ]),
);

export type StageMetadata = z.infer<typeof StageMetadataSchema>;

// Validate-and-narrow a persisted metadata entry to the NetworkComposer shape.
// Using the schema (rather than a hand-rolled `'automaticLayout' in value` check)
// guards against malformed/primitive entries — which would otherwise throw on the
// `in` operator — and rejects a non-boolean value instead of treating it as set.
export const isNetworkComposerStageMetadata = (
  value: unknown,
): value is z.infer<typeof NetworkComposerStageMetadataSchema> =>
  NetworkComposerStageMetadataSchema.safeParse(value).success;

// Validate-and-narrow a persisted metadata entry to the FamilyPedigree shape.
// The metadata union now also includes the DyadCensus tuple-array and the
// NetworkComposer object, so callers must narrow before reading pedigree fields.
export const isFamilyPedigreeStageMetadata = (
  value: unknown,
): value is z.output<typeof StrictFamilyPedigreeStageMetadataSchema> =>
  StrictFamilyPedigreeStageMetadataSchema.safeParse(value).success;
