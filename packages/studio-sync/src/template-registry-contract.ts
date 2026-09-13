import { z } from 'zod';

import {
  TemplateArtifactManifestSchema,
  TemplateContentHashSchema,
} from './template-exchange.ts';
import {
  OrcidSchema,
  StrictUuidSchema,
  TemplateLicenseSchema,
  TemplateMetadataSchema,
} from './template-metadata.ts';

export const RegistryPublisherNameSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      Array.from(value).length <= 200 &&
      value.trim().length > 0 &&
      value.isWellFormed() &&
      !value.includes('\0'),
    { message: 'Must be a nonblank string of at most 200 Unicode code points' },
  )
  .meta({
    maxLength: 200,
    pattern: '^(?=[\\s\\S]*\\S)[\\s\\S]+$(?![\\s\\S])',
  });

export const REGISTRY_CREDENTIAL_PREFIX = 'ncr1_';
export const RegistryCredentialSchema = z
  .string()
  .regex(/^ncr1_[A-Za-z0-9_-]{43}$(?![\s\S])/);
export const RegistryEntryIdSchema = StrictUuidSchema.describe(
  'Publication UUID for this registry entry.',
);

export const RegistryPublisherSchema = z
  .strictObject({
    id: StrictUuidSchema,
    name: RegistryPublisherNameSchema,
    orcid: OrcidSchema.nullable(),
  })
  .meta({ id: 'Publisher' });

export const RegistryEntrySummarySchema = z
  .strictObject({
    id: RegistryEntryIdSchema,
    publisher: RegistryPublisherSchema,
    root: TemplateContentHashSchema.describe(
      'Artifact identity: the merkle_root from the template manifest.',
    ),
    template: TemplateArtifactManifestSchema.shape.template,
    license: TemplateLicenseSchema,
    curated: z.boolean(),
    yanked: z.boolean(),
    published_at: z.iso.datetime(),
  })
  .meta({ id: 'EntrySummary' });

const RegistryActionUrlSchema = z
  .url()
  .regex(/^https?:\/\//i)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.hostname.length > 0 &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !value.includes('\\')
    );
  });

export const RegistryEntrySchema = RegistryEntrySummarySchema.extend({
  metadata: TemplateMetadataSchema,
  artifact_url: RegistryActionUrlSchema.describe(
    'Absolute HTTP(S) Registry GET URL for the artifact identified by this entry root; no user information or fragment.',
  ),
  report_url: RegistryActionUrlSchema.describe(
    'Absolute HTTP(S) Registry POST URL for reports targeting this entry ID; no user information or fragment.',
  ),
}).meta({ id: 'Entry' });

export type RegistryPublisher = z.infer<typeof RegistryPublisherSchema>;
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;
