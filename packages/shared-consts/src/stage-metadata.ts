import { z } from 'zod';

import { FRAMING_IDS } from './family-pedigree-framing';

const FamilyPedigreeStageMetadataSchema = z.object({
  isNetworkCommitted: z.boolean(),
  selectedFraming: z.optional(z.enum([...FRAMING_IDS])),
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
  edges: z.optional(
    z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        attributes: z.record(
          z.string(),
          z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.array(z.number()),
            z.array(z.union([z.string(), z.number(), z.boolean()])),
            z.record(
              z.string(),
              z.union([z.string(), z.boolean(), z.number()]),
            ),
          ]),
        ),
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
): value is z.infer<typeof FamilyPedigreeStageMetadataSchema> =>
  FamilyPedigreeStageMetadataSchema.safeParse(value).success;
