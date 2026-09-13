import { oc } from '@orpc/contract';
import { openapi, OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { z } from 'zod';

import {
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  TemplateContentHashSchema,
} from '@codaco/studio-sync/template-exchange';
import {
  TemplateKindSchema,
  TemplateLicenseSchema,
  StrictUuidSchema,
} from '@codaco/studio-sync/template-metadata';
import {
  RegistryCredentialSchema,
  RegistryEntrySchema,
  RegistryEntrySummarySchema,
} from '@codaco/studio-sync/template-registry-contract';

import {
  AccountSchema,
  ClaimPublisherSchema,
  CreateTokenSchema,
  PublisherSchema,
  ReportSchema,
  ReportCursorSchema,
  ReportsPageSchema,
  TokenDescriptionSchema,
} from './account-contract.ts';
import { paginatedPageSchema, PaginationCursorSchema } from './pagination.ts';
import {
  REGISTRY_PROBLEMS,
  RegistryProblemSchema,
  ProblemContextSchema,
  registryErrorStatuses,
} from './problems.ts';

export const EntrySummarySchema = RegistryEntrySummarySchema;
export const EntrySchema = RegistryEntrySchema;
export const YankedEntrySchema = EntrySchema.extend({
  yanked: z.literal(true),
}).meta({ id: 'YankedEntry' });
export type RegistryEntry = z.infer<typeof EntrySchema>;

const codePointLimitedText = (maxLength: number) =>
  z
    .string()
    .min(1)
    .refine((value) => Array.from(value).length <= maxLength, {
      message: `Must contain at most ${maxLength} Unicode code points`,
    });

export const ListEntriesSchema = z
  .strictObject({
    cursor: PaginationCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    query: codePointLimitedText(200).optional(),
    kind: TemplateKindSchema.optional(),
    license: TemplateLicenseSchema.optional(),
    keyword: codePointLimitedText(100).optional(),
    author: codePointLimitedText(200).optional(),
    curated: z.enum(['true', 'false']).optional(),
    root: TemplateContentHashSchema.describe(
      'Exact artifact root. Combined with publisher_id, includes yanked publications while still excluding removed content.',
    ).optional(),
    publisher_id: StrictUuidSchema.optional(),
  })
  .meta({ id: 'ListEntries' });
export type ListEntries = z.infer<typeof ListEntriesSchema>;

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
type TokenScope = 'publish' | 'moderate';
const entryId = z.strictObject({ id: StrictUuidSchema });
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
const readEntryTarget = z.object({ params: entryId, query: empty });
const artifactTarget = z.object({
  params: artifactRoot,
  query: empty,
  body: empty.optional(),
});
const readArtifactTarget = z.object({ params: artifactRoot, query: empty });
const success = z.strictObject({ ok: z.literal(true) });

const requiredRegistryOrigin = {
  name: 'Origin',
  in: 'header',
  required: true,
  schema: { type: 'string' },
  description:
    'The exact registry origin. Required for cookie-authenticated account writes.',
} as const;

function securedOperation<T extends { parameters?: readonly unknown[] }>(
  operation: T,
  security: typeof bearer | typeof cookie,
) {
  const secured = { ...operation, security };
  return security === cookie
    ? {
        ...secured,
        parameters: [
          ...(operation.parameters ?? []),
          { ...requiredRegistryOrigin },
        ],
      }
    : secured;
}

function tokenOperation<T>(operation: T, scope: TokenScope) {
  return {
    ...operation,
    'security': bearer,
    'x-registry-token-scopes': [scope],
    ...(scope === 'moderate' ? { 'x-registry-operator-required': true } : {}),
  };
}

function operatorSessionOperation<
  T extends { parameters?: readonly unknown[] },
>(operation: T) {
  return {
    ...securedOperation(operation, cookie),
    'x-registry-operator-required': true,
  };
}

function moderationRoutes(
  prefix: '/moderation' | '/account/moderation',
  security: typeof bearer | typeof cookie,
) {
  const secure = <T extends { parameters?: readonly unknown[] }>(
    operation: T,
  ) =>
    security === bearer
      ? tokenOperation(operation, 'moderate')
      : operatorSessionOperation(operation);
  return {
    takedown: route
      .meta(
        openapi({
          method: 'POST',
          path: `${prefix}/entries/{id}/takedown`,
          summary: 'Remove access to an entry’s artifact across all locators',
          inputStructure: 'detailed',
          spec: secure,
        }),
      )
      .input(entryTarget)
      .output(success),
    restore: route
      .meta(
        openapi({
          method: 'POST',
          path: `${prefix}/entries/{id}/restore`,
          summary: 'Restore access after a takedown',
          inputStructure: 'detailed',
          spec: secure,
        }),
      )
      .input(entryTarget)
      .output(success),
    hardDelete: route
      .meta(
        openapi({
          method: 'DELETE',
          path: `${prefix}/artifacts/{root}`,
          summary: 'Permanently remove content and queue object cleanup',
          successStatus: 202,
          inputStructure: 'detailed',
          spec: secure,
        }),
      )
      .input(artifactTarget)
      .output(success),
    suspendPublisher: route
      .meta(
        openapi({
          method: 'PUT',
          path: `${prefix}/publishers/{id}/suspension`,
          summary: 'Suspend or reinstate a publisher',
          inputStructure: 'detailed',
          spec: secure,
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
          path: `${prefix}/entries/{id}/curation`,
          summary: 'Grant or revoke the curated badge',
          inputStructure: 'detailed',
          spec: secure,
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
          method: security === cookie ? 'POST' : 'GET',
          path: `${prefix}/reports`,
          summary: 'Read pending reports',
          spec: secure,
        }),
      )
      .input(
        z.strictObject({
          after: ReportCursorSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
      )
      .output(ReportsPageSchema),
  };
}
const publicModeration = moderationRoutes('/moderation', bearer);
const accountModeration = moderationRoutes('/account/moderation', cookie);

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
    .output(paginatedPageSchema(EntrySummarySchema, PaginationCursorSchema)),
  entry: route
    .meta(
      openapi({
        method: 'GET',
        path: '/entries/{id}',
        summary: 'Read frozen entry metadata',
        inputStructure: 'detailed',
      }),
    )
    .input(readEntryTarget)
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
    .input(readArtifactTarget)
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
        description:
          'A newly created entry has yanked=false. Repeating publication of the same artifact for the same publisher is idempotent: it returns the existing entry and preserves its current withdrawal state, including yanked=true. Publication never reverses a withdrawal.',
        successStatus: 201,
        spec: (operation) => tokenOperation(operation, 'publish'),
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
        description:
          'Requires a publish-scoped credential whose publisher owns the targeted entry.',
        inputStructure: 'detailed',
        spec: (operation) => tokenOperation(operation, 'publish'),
      }),
    )
    .input(entryTarget)
    .output(YankedEntrySchema),
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
    .output(z.strictObject({ id: StrictUuidSchema })),
  me: route
    .meta(
      openapi({
        method: 'GET',
        path: '/publisher',
        summary: 'Verify the registry credential and publisher',
        spec: (operation) => tokenOperation(operation, 'publish'),
      }),
    )
    .output(PublisherSchema),
  account: route
    .meta(
      openapi({
        method: 'GET',
        path: '/account',
        summary: 'Read the current verified account and publisher',
        spec: (operation) => ({ ...operation, security: cookie }),
      }),
    )
    .input(empty)
    .output(AccountSchema),
  claimPublisher: route
    .meta(
      openapi({
        method: 'POST',
        path: '/account/publisher',
        summary: 'Claim a named publisher with a verified registry email',
        spec: (operation) => securedOperation(operation, cookie),
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
        spec: (operation) => ({
          ...securedOperation(operation, cookie),
          'description':
            'Requires a verified registry session with a claimed publisher. If requested scopes contain moderate, the account must be a current operator; otherwise the request returns 403. A moderate credential also requires its owner to remain a current operator when it is used.',
          'x-registry-operator-required-for-scopes': ['moderate'],
        }),
      }),
    )
    .input(CreateTokenSchema)
    .output(
      z.strictObject({
        token: RegistryCredentialSchema,
        credential: TokenDescriptionSchema,
      }),
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
        description:
          'Requires a verified registry session whose account owns the targeted credential. A credential belonging to another account is not accessible or revocable through this operation.',
        inputStructure: 'detailed',
        spec: (operation) => securedOperation(operation, cookie),
      }),
    )
    .input(entryTarget)
    .output(success),
  ...publicModeration,
  accountTakedown: accountModeration.takedown,
  accountRestore: accountModeration.restore,
  accountHardDelete: accountModeration.hardDelete,
  accountSuspendPublisher: accountModeration.suspendPublisher,
  accountCurate: accountModeration.curate,
  accountReports: accountModeration.reports,
};

export async function generateRegistryOpenApi(options: {
  secureSessionCookie: boolean;
}) {
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
              'Registry-issued credentials. Operations declare their required publish or moderate scope with x-registry-token-scopes. x-registry-operator-required requires the credential owner to be a current operator. Studio instance API tokens do not authenticate here.',
          },
          registrySession: {
            type: 'apiKey',
            in: 'cookie',
            name: options.secureSessionCookie
              ? '__Secure-registry.session_token'
              : 'registry.session_token',
            description:
              'Verified email session issued by this registry. Account writes also require the registry Origin header; moderation operations separately declare x-registry-operator-required.',
          },
        },
      },
    },
    customErrorResponseBodySchema: () =>
      converter.convert(RegistryProblemSchema, 'output')[0],
  });
  const problemSchemas = doc.components?.schemas;
  if (!problemSchemas) throw new Error('REGISTRY_PROBLEM_SCHEMAS_MISSING');
  const baseProblemSchema = problemSchemas.RegistryProblem;
  if (!isRecord(baseProblemSchema) || !isRecord(baseProblemSchema.properties))
    throw new Error('REGISTRY_PROBLEM_SCHEMA_INVALID');
  for (const path of Object.values(doc.paths ?? {})) {
    if (!path) continue;
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const operation = path[method];
      if (!operation?.responses) continue;
      for (const parameter of operation.parameters ?? []) {
        if ('in' in parameter && parameter.in === 'query')
          parameter.allowEmptyValue = false;
      }
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
        const problem = response.content['application/problem+json'];
        if (isRecord(problem) && isRecord(problem.schema)) {
          const codes = Object.entries(REGISTRY_PROBLEMS)
            .filter(([, value]) => value.status === Number(status))
            .map(([code]) => code);
          const schemaName = `RegistryProblem${status}`;
          problemSchemas[schemaName] = {
            ...structuredClone(baseProblemSchema),
            properties: {
              ...structuredClone(baseProblemSchema.properties),
              status: { type: 'integer', enum: [Number(status)] },
              code: { type: 'string', enum: codes },
            },
          };
          problem.schema = { $ref: `#/components/schemas/${schemaName}` };
        }
      }
    }
  }
  const publish = doc.paths?.['/entries']?.post;
  const requestBody = publish?.requestBody;
  const multipart =
    isRecord(requestBody) && isRecord(requestBody.content)
      ? requestBody.content['multipart/form-data']
      : undefined;
  if (isRecord(multipart)) {
    multipart.encoding = {
      ...(isRecord(multipart.encoding) ? multipart.encoding : {}),
      artifact: { contentType: TEMPLATE_ARTIFACT_MEDIA_TYPE },
    };
  }
  // These values are free text. Reserved characters must be percent-encoded
  // by clients so that `/`, `?`, `#`, `&`, and `=` remain part of the value
  // instead of changing the request's query structure.
  const freeTextQueryNames = new Set(['query', 'keyword', 'author']);
  const freeTextQueryMaxLengths = new Map([
    ['query', 200],
    ['keyword', 100],
    ['author', 200],
  ]);
  for (const path of Object.values(doc.paths ?? {})) {
    if (!path) continue;
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const operation = path[method];
      if (!operation) continue;
      for (const parameter of operation.parameters ?? []) {
        if (
          'name' in parameter &&
          parameter.in === 'query' &&
          freeTextQueryNames.has(parameter.name)
        ) {
          parameter.allowReserved = false;
          const schema = parameter.schema;
          const maxLength = freeTextQueryMaxLengths.get(parameter.name);
          if (isRecord(schema) && maxLength !== undefined)
            schema.maxLength = maxLength;
        }
      }
    }
  }
  const strictUuidPattern =
    '^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$(?![\\s\\S])';
  const hardenUuidPatterns = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(hardenUuidPatterns);
      return;
    }
    if (!isRecord(value)) return;
    if (value.format === 'uuid') value.pattern = strictUuidPattern;
    Object.values(value).forEach(hardenUuidPatterns);
  };
  hardenUuidPatterns(doc);
  for (const [path, method] of [
    ['/entries', 'get'],
    ['/moderation/reports', 'get'],
    ['/account/moderation/reports', 'post'],
  ] as const) {
    const operation = doc.paths?.[path]?.[method];
    const response = operation?.responses?.['200'];
    const content = isRecord(response) ? response.content : undefined;
    const media = isRecord(content) ? content['application/json'] : undefined;
    const schema = isRecord(media) ? media.schema : undefined;
    if (!isRecord(media) || !isRecord(schema) || !isRecord(schema.properties))
      throw new Error('REGISTRY_PAGE_SCHEMA_INVALID');
    const cursor = schema.properties.next_cursor;
    if (!isRecord(cursor) || !Array.isArray(cursor.anyOf))
      throw new Error('REGISTRY_PAGE_CURSOR_SCHEMA_INVALID');
    const present = cursor.anyOf.find(
      (candidate) => isRecord(candidate) && candidate.type !== 'null',
    );
    if (!isRecord(present)) throw new Error('REGISTRY_PAGE_CURSOR_MISSING');
    const properties = schema.properties;
    media.schema = {
      oneOf: [
        {
          ...schema,
          properties: {
            ...properties,
            next_cursor: present,
            has_more: { type: 'boolean', const: true },
          },
        },
        {
          ...schema,
          properties: {
            ...properties,
            next_cursor: { type: 'null' },
            has_more: { type: 'boolean', const: false },
          },
        },
      ],
    };
  }
  return doc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
