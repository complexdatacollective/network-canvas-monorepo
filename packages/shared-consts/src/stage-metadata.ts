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

export const StageMetadataSchema = z.record(
  z.string(), // stage ID
  z.union([DyadCensusStageMetadataSchema, NetworkComposerStageMetadataSchema]),
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
