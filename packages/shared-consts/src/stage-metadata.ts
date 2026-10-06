import { z } from 'zod';

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

// FamilyPedigree persists the framing a participant chose, when the stage lets
// them choose (`framing: 'participantPreference'`), so they are asked once.
// The values are schema 8's FRAMING_IDS, which this package cannot import.
const FamilyPedigreeStageMetadataSchema = z.object({
  framing: z.enum(['gendered', 'gamete']),
});

export const StageMetadataSchema = z.record(
  z.string(), // stage ID
  z.union([
    DyadCensusStageMetadataSchema,
    NetworkComposerStageMetadataSchema,
    FamilyPedigreeStageMetadataSchema,
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
export const isFamilyPedigreeStageMetadata = (
  value: unknown,
): value is z.infer<typeof FamilyPedigreeStageMetadataSchema> =>
  FamilyPedigreeStageMetadataSchema.safeParse(value).success;
