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
// The values are schema 9's FRAMING_IDS, which this package cannot import.
// It also records who holds a label it saved as their name because the
// participant left them unnamed: node ID to an opaque fingerprint of the name
// attribute value it wrote, never the label's text (which would copy names
// out of an encrypted attribute). On a return visit a person whose stored
// value still matches is treated as unnamed and given a fresh label; a name
// written since, here or on another stage, no longer matches and is kept.
// It also records, by node ID, the stand-ins it generated: unnamed people it
// added to hold a missing genetic parent's place, who give way (and may be
// removed) when a genetic parent is recorded there. Only people listed here
// are ever treated as stand-ins; anyone the participant names or describes
// is taken off the list, as someone in their own right.
// Any may be absent, but not all: an entry holding none is not one.
const FamilyPedigreeStageMetadataSchema = z
  .object({
    framing: z.enum(['gendered', 'gamete']).optional(),
    generatedLabels: z.record(z.string(), z.string()).optional(),
    standIns: z.array(z.string()).optional(),
  })
  .refine(
    (entry) =>
      entry.framing !== undefined ||
      entry.generatedLabels !== undefined ||
      entry.standIns !== undefined,
  );

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
