import { z } from 'zod';

const FamilyPedigreeStageMetadataSchema = z.object({
  isNetworkCommitted: z.boolean(),
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
        // Internal-only: which gamete a biological/donor parent contributed.
        // Persisted in stage metadata for labelling; never part of the network.
        gameteRole: z.optional(z.enum(['egg', 'sperm'])),
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

export const StageMetadataSchema = z.record(
  z.string(), // stage ID
  z.union([FamilyPedigreeStageMetadataSchema, DyadCensusStageMetadataSchema]),
);

export type StageMetadata = z.infer<typeof StageMetadataSchema>;
