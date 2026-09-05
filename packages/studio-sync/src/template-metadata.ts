import { z } from 'zod';

export const TemplateKindSchema = z.enum([
  'protocol',
  'stage',
  'entity_definition',
  'variable_set',
  'generator_prompt_set',
]);
export const TemplateLicenseSchema = z.enum(['CC-BY-4.0', 'CC0-1.0']);

const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        value.trim().length > 0 &&
        !value.includes('\0') &&
        value.isWellFormed(),
    );
const link = z
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:');

// ORCID is a format-validated identifier, not a claim that the registry has
// verified ownership. Authentication never relies on this author-editable field.
export const OrcidSchema = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);

/** #1283's authored document. Validation does not rewrite imported metadata. */
export const TemplateMetadataSchema = z.strictObject({
  schema_version: z.literal(1),
  authors: z
    .array(
      z.strictObject({
        name: text(200),
        affiliation: text(500).optional(),
        orcid: OrcidSchema.optional(),
      }),
    )
    .max(100)
    .optional(),
  keywords: z.array(text(100)).max(100).optional(),
  description: text(20_000).optional(),
  publications: z
    .array(
      z.strictObject({
        doi: z
          .string()
          .min(1)
          .max(255)
          .regex(/^10\.\d{4,9}\/[^\s]+$/)
          .refine((value) => !value.includes('\0') && value.isWellFormed())
          .optional(),
        citation: text(4000),
        relation: z.enum(['describes', 'validates', 'uses']),
      }),
    )
    .max(100)
    .optional(),
  related_links: z
    .array(
      z.strictObject({
        url: link,
        label: text(200).optional(),
      }),
    )
    .max(100)
    .optional(),
  funding: text(4000).optional(),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;

/** Curation adds a metadata bar, never a publication gate. */
export function hasCuratedMetadata(metadata: TemplateMetadata): boolean {
  return Boolean(
    metadata.authors?.length &&
    metadata.description?.trim() &&
    metadata.keywords?.length,
  );
}

/** Machine-written instance provenance is separate from author metadata. */
export const TemplateRegistryOriginSchema = z.strictObject({
  registry_url: link,
  entry_id: z.uuid(),
  source_version_hash: z.string().regex(/^[0-9a-f]{64}$/),
  fetched_at: z.iso.datetime(),
});
