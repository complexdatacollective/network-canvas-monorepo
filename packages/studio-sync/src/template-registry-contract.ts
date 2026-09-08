import { z } from 'zod';

import {
  TemplateArtifactManifestSchema,
  TemplateContentHashSchema,
} from './template-exchange.ts';
import {
  OrcidSchema,
  TemplateLicenseSchema,
  TemplateMetadataSchema,
} from './template-metadata.ts';

const nonblank = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value.trim().length > 0 && value.isWellFormed() && !value.includes('\0'),
  );

export const REGISTRY_CREDENTIAL_PREFIX = 'ncr1_';
export const RegistryCredentialSchema = z
  .string()
  .regex(/^ncr1_[A-Za-z0-9_-]{43}$/);
export const RegistryEntryIdSchema = z.uuid();

export const RegistryPublisherSchema = z
  .strictObject({ id: z.uuid(), name: nonblank, orcid: OrcidSchema.nullable() })
  .meta({ id: 'Publisher' });

export const RegistryEntrySummarySchema = z
  .strictObject({
    id: RegistryEntryIdSchema,
    publisher: RegistryPublisherSchema,
    root: TemplateContentHashSchema,
    template: TemplateArtifactManifestSchema.shape.template,
    license: TemplateLicenseSchema,
    curated: z.boolean(),
    yanked: z.boolean(),
    published_at: z.iso.datetime(),
  })
  .meta({ id: 'EntrySummary' });

export const RegistryEntrySchema = RegistryEntrySummarySchema.extend({
  metadata: TemplateMetadataSchema,
  artifact_url: z.url(),
  report_url: z.url(),
}).meta({ id: 'Entry' });

export type RegistryPublisher = z.infer<typeof RegistryPublisherSchema>;
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;
