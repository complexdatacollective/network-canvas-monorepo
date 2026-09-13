import { z } from 'zod';

/** UUID validation with an end assertion that is strict across regex runtimes. */
export const StrictUuidSchema = z
  .uuid()
  .refine(
    (value) =>
      /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$(?![\s\S])/.test(
        value,
      ),
    { message: 'Invalid UUID' },
  );

export const TemplateKindSchema = z.enum([
  'protocol',
  'stage',
  'entity_definition',
  'variable_set',
  'generator_prompt_set',
]);
export const TemplateLicenseSchema = z.enum(['CC-BY-4.0', 'CC0-1.0']);

/** Display text uses the Unicode scalar count shared by JSON Schema clients. */
export const templateDisplayText = (maximum: number) =>
  z
    .string()
    .min(1)
    .refine(
      (value) =>
        Array.from(value).length <= maximum &&
        !value.includes('\0') &&
        value.isWellFormed(),
      {
        message: `Must contain at most ${maximum} Unicode code points, without NUL or unpaired surrogates`,
      },
    )
    .meta({ maxLength: maximum });

const text = (maximum: number) =>
  templateDisplayText(maximum)
    .refine((value) => value.trim().length > 0)
    .meta({ pattern: '^(?=[\\s\\S]*\\S)[\\s\\S]+$(?![\\s\\S])' });
const link = templateDisplayText(2048)
  .regex(/^[Hh][Tt][Tt][Pp][Ss]:\/\//)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === 'https:' &&
        /^https:\/\/[^/?#]+(?:[/?#]|$)/i.test(value) &&
        parsed.hostname.length > 0 &&
        parsed.username.length === 0 &&
        parsed.password.length === 0 &&
        !value.includes('\\')
      );
    } catch {
      return false;
    }
  })
  .describe(
    'WHATWG HTTPS URL with a nonempty authority and no username, password, or backslash; internationalized hostnames are permitted.',
  );

// ORCID is a format-validated identifier, not a claim that the registry has
// verified ownership. Authentication never relies on this author-editable field.
export const OrcidSchema = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);

/** #1283's authored document. Validation does not rewrite imported metadata. */
export const TemplateMetadataSchema = z.strictObject({
  // Keep this field an integer in the wire contract while retaining the
  // version-1 bounds in the runtime validator.
  schema_version: z
    .number()
    .int()
    .min(1)
    .max(1)
    .meta({ enum: [1] }),
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
        doi: templateDisplayText(255)
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
  entry_id: StrictUuidSchema,
  source_version_hash: z.string().regex(/^[0-9a-f]{64}$(?![\s\S])/),
  fetched_at: z.iso.datetime(),
});
