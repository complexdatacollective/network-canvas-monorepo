import { oc } from '@orpc/contract';
import { openapi, OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { z } from 'zod';

import {
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  TemplateArtifactManifestSchema,
  TemplateContentHashSchema,
} from '@codaco/studio-sync/template-exchange';
import {
  OrcidSchema,
  TemplateKindSchema,
  TemplateLicenseSchema,
  TemplateMetadataSchema,
} from '@codaco/studio-sync/template-metadata';

import {
  REGISTRY_PROBLEMS,
  RegistryProblemSchema,
  ProblemContextSchema,
  registryErrorStatuses,
} from './problems.ts';

const nonblank = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value.trim().length > 0 && value.isWellFormed() && !value.includes('\0'),
  );
const stamp = z.iso.datetime();
export const PublisherSchema = z
  .strictObject({ id: z.uuid(), name: nonblank, orcid: OrcidSchema.nullable() })
  .meta({ id: 'Publisher' });
export const EntrySummarySchema = z
  .strictObject({
    id: z.uuid(),
    publisher: PublisherSchema,
    root: TemplateContentHashSchema,
    template: TemplateArtifactManifestSchema.shape.template,
    license: TemplateLicenseSchema,
    curated: z.boolean(),
    yanked: z.boolean(),
    published_at: stamp,
  })
  .meta({ id: 'EntrySummary' });
export const EntrySchema = EntrySummarySchema.extend({
  metadata: TemplateMetadataSchema,
  artifact_url: z.url(),
  report_url: z.url(),
}).meta({ id: 'Entry' });
export type RegistryEntry = z.infer<typeof EntrySchema>;

export const ListEntriesSchema = z
  .strictObject({
    cursor: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    query: z.string().min(1).max(200).optional(),
    kind: TemplateKindSchema.optional(),
    license: TemplateLicenseSchema.optional(),
    keyword: z.string().min(1).max(100).optional(),
    author: z.string().min(1).max(200).optional(),
    curated: z.enum(['true', 'false']).optional(),
  })
  .meta({ id: 'ListEntries' });
export type ListEntries = z.infer<typeof ListEntriesSchema>;

export const ClaimPublisherSchema = z.strictObject({
  name: nonblank,
  orcid: OrcidSchema.optional(),
});
const TokenScopeSchema = z.enum(['publish', 'moderate']);
export const CreateTokenSchema = z.strictObject({
  name: z.string().min(1).max(100),
  scopes: z
    .array(TokenScopeSchema)
    .min(1)
    .max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length),
  lifetime_days: z.number().int().min(1).max(365).default(90),
});
export const TokenDescriptionSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(TokenScopeSchema),
  created_at: stamp,
  expires_at: stamp,
  revoked_at: stamp.nullable(),
});
export const ReportSchema = z.strictObject({
  category: z.enum([
    'privacy',
    'copyright',
    'harmful_content',
    'spam',
    'other',
  ]),
  details: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (value) =>
        value.trim().length > 0 &&
        value.isWellFormed() &&
        !value.includes('\0'),
    ),
});
export type RegistryReport = z.infer<typeof ReportSchema>;

const route = oc.errors({
  ...REGISTRY_PROBLEMS,
  RATE_LIMITED: {
    ...REGISTRY_PROBLEMS.RATE_LIMITED,
    data: ProblemContextSchema,
  },
  SCHEMA_UNSUPPORTED: {
    ...REGISTRY_PROBLEMS.SCHEMA_UNSUPPORTED,
    data: ProblemContextSchema,
  },
});
const bearer = [{ registryToken: [] }];
const cookie = [{ registrySession: [] }];
const entryId = z.strictObject({ id: z.uuid() });
const artifactRoot = z.strictObject({ root: TemplateContentHashSchema });
const empty = z.strictObject({});
// Keep transport namespaces separate. Compact decoding merges body/query fields
// over path parameters, so an otherwise valid request can change its target.
// The outer object strips the transport's headers; each public namespace is strict.
const entryTarget = z.object({
  params: entryId,
  query: empty,
  body: empty.optional(),
});
const artifactTarget = z.object({
  params: artifactRoot,
  query: empty,
  body: empty.optional(),
});
const success = z.strictObject({ ok: z.literal(true) });

export const registryContract = {
  listEntries: route
    .meta(
      openapi({
        method: 'GET',
        path: '/entries',
        summary: 'Browse published entries',
      }),
    )
    .input(ListEntriesSchema)
    .output(
      z.strictObject({
        data: z.array(EntrySummarySchema),
        next_cursor: z.string().nullable(),
      }),
    ),
  entry: route
    .meta(
      openapi({
        method: 'GET',
        path: '/entries/{id}',
        summary: 'Read frozen entry metadata',
        inputStructure: 'detailed',
      }),
    )
    .input(entryTarget)
    .output(EntrySchema),
  artifact: route
    .meta(
      openapi({
        method: 'GET',
        path: '/artifacts/{root}',
        summary: 'Fetch a verified artifact by its registry-independent root',
        inputStructure: 'detailed',
        outputStructure: 'detailed',
      }),
    )
    .input(artifactTarget)
    .output(
      z.strictObject({
        headers: z.strictObject({
          'content-type': z.literal(TEMPLATE_ARTIFACT_MEDIA_TYPE),
          'content-disposition': z.string(),
          'cache-control': z.literal('no-store'),
          'etag': z.string(),
          'x-template-root': TemplateContentHashSchema,
          'x-registry-yanked': z
            .enum(['true', 'false'])
            .describe(
              'True only when every publisher entry for this root has been yanked. Individual entry responses retain their own publisher withdrawal state.',
            ),
        }),
        body: z
          .file()
          .mime(TEMPLATE_ARTIFACT_MEDIA_TYPE)
          .max(TEMPLATE_ARTIFACT_LIMITS.archiveBytes),
      }),
    ),
  publish: route
    .meta(
      openapi({
        method: 'POST',
        path: '/entries',
        summary: 'Publish a verified template artifact',
        successStatus: 201,
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(
      z.strictObject({
        artifact: z.file().max(TEMPLATE_ARTIFACT_LIMITS.archiveBytes),
      }),
    )
    .output(EntrySchema),
  yank: route
    .meta(
      openapi({
        method: 'POST',
        path: '/entries/{id}/yank',
        summary: 'Withdraw an entry from browsing',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(entryTarget)
    .output(EntrySchema),
  report: route
    .meta(
      openapi({
        method: 'POST',
        path: '/entries/{id}/reports',
        summary: 'Report an entry',
        successStatus: 202,
        inputStructure: 'detailed',
      }),
    )
    .input(z.object({ params: entryId, query: empty, body: ReportSchema }))
    .output(z.strictObject({ id: z.uuid() })),
  me: route
    .meta(
      openapi({
        method: 'GET',
        path: '/publisher',
        summary: 'Verify the registry credential and publisher',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .output(PublisherSchema),
  claimPublisher: route
    .meta(
      openapi({
        method: 'POST',
        path: '/account/publisher',
        summary: 'Claim a named publisher with a verified registry email',
        spec: (operation) => ({ ...operation, security: cookie }),
      }),
    )
    .input(ClaimPublisherSchema)
    .output(PublisherSchema),
  createToken: route
    .meta(
      openapi({
        method: 'POST',
        path: '/account/tokens',
        summary: 'Issue a registry credential',
        successStatus: 201,
        spec: (operation) => ({ ...operation, security: cookie }),
      }),
    )
    .input(CreateTokenSchema)
    .output(
      z.strictObject({ token: z.string(), credential: TokenDescriptionSchema }),
    ),
  listTokens: route
    .meta(
      openapi({
        method: 'GET',
        path: '/account/tokens',
        summary: 'List this account’s active registry credentials',
        spec: (operation) => ({ ...operation, security: cookie }),
      }),
    )
    .output(z.strictObject({ data: z.array(TokenDescriptionSchema) })),
  revokeToken: route
    .meta(
      openapi({
        method: 'DELETE',
        path: '/account/tokens/{id}',
        summary: 'Revoke a registry credential',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: cookie }),
      }),
    )
    .input(entryTarget)
    .output(success),
  takedown: route
    .meta(
      openapi({
        method: 'POST',
        path: '/moderation/entries/{id}/takedown',
        summary: 'Remove access to an entry’s artifact across all locators',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(entryTarget)
    .output(success),
  restore: route
    .meta(
      openapi({
        method: 'POST',
        path: '/moderation/entries/{id}/restore',
        summary: 'Restore access after a takedown',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(entryTarget)
    .output(success),
  hardDelete: route
    .meta(
      openapi({
        method: 'DELETE',
        path: '/moderation/artifacts/{root}',
        summary: 'Permanently remove content and queue object cleanup',
        successStatus: 202,
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(artifactTarget)
    .output(success),
  suspendPublisher: route
    .meta(
      openapi({
        method: 'PUT',
        path: '/moderation/publishers/{id}/suspension',
        summary: 'Suspend or reinstate a publisher',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(
      z.object({
        params: entryId,
        query: empty,
        body: z.strictObject({ suspended: z.boolean() }),
      }),
    )
    .output(success),
  curate: route
    .meta(
      openapi({
        method: 'PUT',
        path: '/moderation/entries/{id}/curation',
        summary: 'Grant or revoke the curated badge',
        inputStructure: 'detailed',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(
      z.object({
        params: entryId,
        query: empty,
        body: z.strictObject({ curated: z.boolean() }),
      }),
    )
    .output(success),
  reports: route
    .meta(
      openapi({
        method: 'GET',
        path: '/moderation/reports',
        summary: 'Read pending reports',
        spec: (operation) => ({ ...operation, security: bearer }),
      }),
    )
    .input(
      z.strictObject({
        after: z
          .string()
          .regex(/^[1-9][0-9]{0,18}$/)
          .optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    )
    .output(
      z.strictObject({
        data: z.array(
          z.strictObject({
            id: z.uuid(),
            entry_id: z.uuid(),
            category: ReportSchema.shape.category,
            details: z.string().nullable(),
            created_at: stamp,
          }),
        ),
        next_cursor: z.string().nullable(),
      }),
    ),
};

export async function generateRegistryOpenApi() {
  const converter = new ZodToJsonSchemaConverter();
  const generator = new OpenAPIGenerator({ converters: [converter] });
  const doc = await generator.generate(registryContract, {
    errorStatusMap: registryErrorStatuses,
    base: {
      openapi: '3.1.1',
      info: {
        title: 'Network Canvas Template Registry API',
        version: '1.0.0',
        license: { name: 'CC0-1.0', identifier: 'CC0-1.0' },
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          registryToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'ncr1_<256-bit secret>',
            description:
              'Registry-issued credentials. Studio instance API tokens do not authenticate here.',
          },
          registrySession: {
            type: 'apiKey',
            in: 'cookie',
            name: '__Secure-registry.session_token',
            description:
              'Verified email session issued by this registry. Account writes also require the registry Origin header.',
          },
        },
      },
    },
    customErrorResponseBodySchema: () =>
      converter.convert(RegistryProblemSchema, 'output')[0],
  });
  for (const path of Object.values(doc.paths ?? {})) {
    if (!path) continue;
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const operation = path[method];
      if (!operation?.responses) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (
          Number(status) < 400 ||
          !isRecord(response) ||
          !isRecord(response.content) ||
          !response.content['application/json']
        )
          continue;
        response.content['application/problem+json'] =
          response.content['application/json'];
        delete response.content['application/json'];
      }
    }
  }
  return doc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
