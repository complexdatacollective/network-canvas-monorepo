import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { implement, ORPCError } from '@orpc/server';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
} from '@codaco/studio-sync/template-exchange';

import {
  EntrySchema,
  generateRegistryOpenApi,
  registryContract,
} from './contract.ts';
import {
  REGISTRY_PROBLEMS,
  registryErrorStatuses,
  type RegistryProblemCode,
} from './problems.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ROOT = 'a'.repeat(64);
const OTHER_ROOT = 'b'.repeat(64);
const ARTIFACT_BYTES = new Uint8Array([80, 75, 3, 4]);
const entry = EntrySchema.parse({
  id: ID,
  publisher: { id: ID, name: 'Publisher', orcid: null },
  root: ROOT,
  template: { name: 'Codec fixture', kind: 'protocol', version: 1 },
  license: 'CC0-1.0',
  curated: false,
  yanked: false,
  published_at: '2026-09-05T00:00:00.000Z',
  metadata: { schema_version: 1 },
  artifact_url: `https://registry.test/api/v1/artifacts/${ROOT}`,
  report_url: `https://registry.test/api/v1/entries/${ID}/reports`,
});

type PathRoute =
  | 'entry'
  | 'artifact'
  | 'yank'
  | 'report'
  | 'revokeToken'
  | 'takedown'
  | 'restore'
  | 'hardDelete'
  | 'suspendPublisher'
  | 'curate';
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type PathCase = {
  key: PathRoute;
  method: Method;
  path: `/${string}`;
  parameter: 'id' | 'root';
  status: number;
  body?: Record<string, string | boolean>;
};
const pathCases: PathCase[] = [
  {
    key: 'entry',
    method: 'GET',
    path: '/entries/{id}',
    parameter: 'id',
    status: 200,
  },
  {
    key: 'artifact',
    method: 'GET',
    path: '/artifacts/{root}',
    parameter: 'root',
    status: 200,
  },
  {
    key: 'yank',
    method: 'POST',
    path: '/entries/{id}/yank',
    parameter: 'id',
    status: 200,
  },
  {
    key: 'report',
    method: 'POST',
    path: '/entries/{id}/reports',
    parameter: 'id',
    status: 202,
    body: {
      category: 'privacy',
      details: 'The report explains a specific concern.',
    },
  },
  {
    key: 'revokeToken',
    method: 'DELETE',
    path: '/account/tokens/{id}',
    parameter: 'id',
    status: 200,
  },
  {
    key: 'takedown',
    method: 'POST',
    path: '/moderation/entries/{id}/takedown',
    parameter: 'id',
    status: 200,
  },
  {
    key: 'restore',
    method: 'POST',
    path: '/moderation/entries/{id}/restore',
    parameter: 'id',
    status: 200,
  },
  {
    key: 'hardDelete',
    method: 'DELETE',
    path: '/moderation/artifacts/{root}',
    parameter: 'root',
    status: 202,
  },
  {
    key: 'suspendPublisher',
    method: 'PUT',
    path: '/moderation/publishers/{id}/suspension',
    parameter: 'id',
    status: 200,
    body: { suspended: true },
  },
  {
    key: 'curate',
    method: 'PUT',
    path: '/moderation/entries/{id}/curation',
    parameter: 'id',
    status: 200,
    body: { curated: true },
  },
];

const errorStatuses = {
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  REQUEST_TIMEOUT: 408,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  CONTENT_REMOVED: 410,
  CONFLICT: 409,
  CONTENT_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  STORAGE_LIMIT_REACHED: 409,
  ARTIFACT_INVALID: 422,
  FORMAT_UNSUPPORTED: 422,
  SCHEMA_UNSUPPORTED: 422,
  CURATION_METADATA_REQUIRED: 422,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
} as const;
const errorCases = (
  Object.keys(errorStatuses) as (keyof typeof errorStatuses)[]
).map((code) => ({ code, status: errorStatuses[code] }));

// These handlers test the installed HTTP codec and contract. They do not model
// authentication, persistence, or artifact verification; route integration uses
// the real registry service and PostgreSQL in the separate service suite.
function codec(errorCode?: RegistryProblemCode) {
  const calls: { route: PathRoute; input: unknown }[] = [];
  const respond = <T>(route: PathRoute, input: unknown, output: T): T => {
    calls.push({ route, input });
    if (errorCode) throw new ORPCError(errorCode);
    return output;
  };
  const os = implement(registryContract);
  const handler = new OpenAPIHandler(
    {
      entry: os.entry.handler(({ input }) => respond('entry', input, entry)),
      artifact: os.artifact.handler(({ input }) =>
        respond('artifact', input, {
          headers: {
            'content-type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
            'content-disposition': `attachment; filename="${ROOT}.nctemplate"`,
            'cache-control': 'no-store' as const,
            'etag': `"${ROOT}"`,
            'x-template-root': ROOT,
            'x-registry-yanked': 'false' as const,
          },
          body: new File([ARTIFACT_BYTES], 'fixture.nctemplate', {
            type: TEMPLATE_ARTIFACT_MEDIA_TYPE,
          }),
        }),
      ),
      yank: os.yank.handler(({ input }) => respond('yank', input, entry)),
      report: os.report.handler(({ input }) =>
        respond('report', input, { id: OTHER_ID }),
      ),
      revokeToken: os.revokeToken.handler(({ input }) =>
        respond('revokeToken', input, { ok: true as const }),
      ),
      takedown: os.takedown.handler(({ input }) =>
        respond('takedown', input, { ok: true as const }),
      ),
      restore: os.restore.handler(({ input }) =>
        respond('restore', input, { ok: true as const }),
      ),
      hardDelete: os.hardDelete.handler(({ input }) =>
        respond('hardDelete', input, { ok: true as const }),
      ),
      suspendPublisher: os.suspendPublisher.handler(({ input }) =>
        respond('suspendPublisher', input, { ok: true as const }),
      ),
      curate: os.curate.handler(({ input }) =>
        respond('curate', input, { ok: true as const }),
      ),
    },
    { errorStatusMap: registryErrorStatuses },
  );
  return {
    calls,
    async request(
      scenario: PathCase,
      options: {
        body?: Record<string, string | boolean>;
        query?: Record<string, string>;
      } = {},
    ) {
      const url = new URL(
        `https://registry.test/api/v1${scenario.path.replace('{id}', ID).replace('{root}', ROOT)}`,
      );
      for (const [key, value] of Object.entries(options.query ?? {}))
        url.searchParams.set(key, value);
      const body = options.body ?? scenario.body;
      const result = await handler.handle(
        new Request(url, {
          method: scenario.method,
          ...(body === undefined
            ? {}
            : {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              }),
        }),
        { prefix: '/api/v1' },
      );
      expect(result.matched).toBe(true);
      if (!result.response)
        throw new Error('Expected a matched codec response');
      return result.response;
    },
  };
}

describe('registry path targets through the installed HTTP codec', () => {
  it.each(pathCases)(
    '$key accepts its valid detailed request',
    async (scenario) => {
      const subject = codec();
      const response = await subject.request(scenario);
      expect(response.status).toBe(scenario.status);
      expect(subject.calls).toEqual([
        {
          route: scenario.key,
          input: expect.objectContaining({
            params: {
              [scenario.parameter]: scenario.parameter === 'id' ? ID : ROOT,
            },
            query: {},
          }),
        },
      ]);
      expect(record(subject.calls[0]!.input).body).toEqual(scenario.body);
      if (scenario.key === 'artifact') {
        expect(response.headers.get('content-type')).toBe(
          TEMPLATE_ARTIFACT_MEDIA_TYPE,
        );
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
          ARTIFACT_BYTES,
        );
      } else if (scenario.key === 'report') {
        expect(await response.json()).toEqual({ id: OTHER_ID });
      } else {
        expect(await response.json()).toMatchObject(
          scenario.key === 'entry' || scenario.key === 'yank'
            ? { id: ID, root: ROOT }
            : { ok: true },
        );
      }
    },
  );

  it.each(pathCases)(
    '$key rejects a query target override',
    async (scenario) => {
      const subject = codec();
      const response = await subject.request(scenario, {
        query: {
          [scenario.parameter]:
            scenario.parameter === 'id' ? OTHER_ID : OTHER_ROOT,
        },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST' });
      expect(subject.calls).toEqual([]);
    },
  );

  it.each(pathCases.filter((scenario) => scenario.method !== 'GET'))(
    '$key rejects a body target override',
    async (scenario) => {
      const subject = codec();
      const response = await subject.request(scenario, {
        body: {
          ...scenario.body,
          [scenario.parameter]:
            scenario.parameter === 'id' ? OTHER_ID : OTHER_ROOT,
        },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST' });
      expect(subject.calls).toEqual([]);
    },
  );

  it.each(errorCases)(
    'encodes $code with HTTP $status',
    async ({ code, status }) => {
      const subject = codec(code);
      const response = await subject.request(pathCases[0]!);
      expect(subject.calls).toHaveLength(1);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    },
  );
});

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an OpenAPI object');
  return value as Record<string, unknown>;
}

const operationCases = [
  {
    key: 'listEntries',
    method: 'get',
    path: '/entries',
    status: 200,
    security: null,
  },
  {
    key: 'entry',
    method: 'get',
    path: '/entries/{id}',
    status: 200,
    security: null,
  },
  {
    key: 'artifact',
    method: 'get',
    path: '/artifacts/{root}',
    status: 200,
    security: null,
  },
  {
    key: 'publish',
    method: 'post',
    path: '/entries',
    status: 201,
    security: 'registryToken',
  },
  {
    key: 'yank',
    method: 'post',
    path: '/entries/{id}/yank',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'report',
    method: 'post',
    path: '/entries/{id}/reports',
    status: 202,
    security: null,
  },
  {
    key: 'me',
    method: 'get',
    path: '/publisher',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'claimPublisher',
    method: 'post',
    path: '/account/publisher',
    status: 200,
    security: 'registrySession',
  },
  {
    key: 'createToken',
    method: 'post',
    path: '/account/tokens',
    status: 201,
    security: 'registrySession',
  },
  {
    key: 'listTokens',
    method: 'get',
    path: '/account/tokens',
    status: 200,
    security: 'registrySession',
  },
  {
    key: 'revokeToken',
    method: 'delete',
    path: '/account/tokens/{id}',
    status: 200,
    security: 'registrySession',
  },
  {
    key: 'takedown',
    method: 'post',
    path: '/moderation/entries/{id}/takedown',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'restore',
    method: 'post',
    path: '/moderation/entries/{id}/restore',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'hardDelete',
    method: 'delete',
    path: '/moderation/artifacts/{root}',
    status: 202,
    security: 'registryToken',
  },
  {
    key: 'suspendPublisher',
    method: 'put',
    path: '/moderation/publishers/{id}/suspension',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'curate',
    method: 'put',
    path: '/moderation/entries/{id}/curation',
    status: 200,
    security: 'registryToken',
  },
  {
    key: 'reports',
    method: 'get',
    path: '/moderation/reports',
    status: 200,
    security: 'registryToken',
  },
] as const;

describe('generated registry OpenAPI', () => {
  let document: Awaited<ReturnType<typeof generateRegistryOpenApi>>;
  beforeAll(async () => {
    document = await generateRegistryOpenApi();
  });

  it('covers every operation, path target and public problem code', () => {
    expect(operationCases).toHaveLength(17);
    expect(pathCases).toHaveLength(10);
    expect(Object.keys(registryContract).toSorted()).toEqual(
      operationCases.map((scenario) => scenario.key).toSorted(),
    );
    expect(
      operationCases
        .filter((scenario) => scenario.path.includes('{'))
        .map((scenario) => scenario.key)
        .toSorted(),
    ).toEqual(pathCases.map((scenario) => scenario.key).toSorted());
    expect(Object.keys(REGISTRY_PROBLEMS).toSorted()).toEqual(
      Object.keys(errorStatuses).toSorted(),
    );
    expect(document.openapi).toBe('3.1.1');
    expect(document.servers).toEqual([{ url: '/api/v1' }]);
    expect(document.security ?? []).toEqual([]);
    expect(document.info.license).toEqual({
      name: 'CC0-1.0',
      identifier: 'CC0-1.0',
    });
  });

  it.each(operationCases)(
    '$key preserves exact statuses, problem media and security',
    (scenario) => {
      const operation = record(
        record(document.paths?.[scenario.path])[scenario.method],
      );
      expect(operation.operationId).toBe(scenario.key);
      expect(operation.security ?? []).toEqual(
        scenario.security ? [{ [scenario.security]: [] }] : [],
      );
      const responses = record(operation.responses);
      const failures = [...new Set(Object.values(errorStatuses).map(String))];
      expect(Object.keys(responses).toSorted()).toEqual(
        [String(scenario.status), ...failures].toSorted(),
      );
      expect(record(responses[String(scenario.status)]).content).toBeDefined();
      for (const status of failures) {
        const content = record(record(responses[status]).content);
        expect(Object.keys(content)).toEqual(['application/problem+json']);
        expect(record(content['application/problem+json']).schema).toEqual({
          $ref: '#/components/schemas/RegistryProblem',
        });
      }
    },
  );

  it('describes the strict correlated problem envelope and registry-only credentials', () => {
    const components = record(document.components);
    const problem = record(record(components.schemas).RegistryProblem);
    expect(problem.type).toBe('object');
    expect(problem.additionalProperties).toBe(false);
    expect(problem.required).toEqual([
      'type',
      'title',
      'status',
      'code',
      'request_id',
    ]);
    const properties = record(problem.properties);
    expect(record(properties.code).enum).toEqual(
      expect.arrayContaining(Object.keys(errorStatuses)),
    );
    expect(record(properties.code).enum).toHaveLength(errorCases.length);
    expect(record(properties.request_id).format).toBe('uuid');
    expect(record(properties.context).additionalProperties).toBe(false);
    const schemes = record(components.securitySchemes);
    expect(Object.keys(schemes).toSorted()).toEqual([
      'registrySession',
      'registryToken',
    ]);
    expect(schemes.registrySession).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: '__Secure-registry.session_token',
    });
    expect(schemes.registryToken).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'ncr1_<256-bit secret>',
    });
  });

  it('describes the exact artifact media type, bounded binary data and moderation headers', () => {
    const operation = record(record(document.paths?.['/artifacts/{root}']).get);
    const response = record(record(operation.responses)['200']);
    const content = record(response.content);
    expect(Object.keys(content)).toEqual([TEMPLATE_ARTIFACT_MEDIA_TYPE]);
    expect(record(content[TEMPLATE_ARTIFACT_MEDIA_TYPE]).schema).toMatchObject({
      type: 'string',
      format: 'binary',
      maxLength: TEMPLATE_ARTIFACT_LIMITS.archiveBytes,
    });
    const headers = record(response.headers);
    expect(headers['cache-control']).toMatchObject({
      required: true,
      schema: { const: 'no-store' },
    });
    expect(headers['x-template-root']).toMatchObject({
      required: true,
      schema: { pattern: '^[0-9a-f]{64}$' },
    });
    expect(headers['x-registry-yanked']).toMatchObject({
      required: true,
      schema: { enum: ['true', 'false'] },
    });
  });

  it('keeps file upload and mutation bodies separate from their path identities', () => {
    const publish = record(record(document.paths?.['/entries']).post);
    const uploadSchema = record(
      record(record(record(publish.requestBody).content)['multipart/form-data'])
        .schema,
    );
    expect(uploadSchema.required).toEqual(['artifact']);
    expect(uploadSchema.additionalProperties).toBe(false);
    expect(record(uploadSchema.properties).artifact).toMatchObject({
      type: 'string',
      format: 'binary',
      maxLength: TEMPLATE_ARTIFACT_LIMITS.archiveBytes,
    });
    for (const scenario of pathCases.filter(
      (candidate) => candidate.body !== undefined,
    )) {
      const operation = record(
        record(document.paths?.[scenario.path])[scenario.method.toLowerCase()],
      );
      const schema = record(
        record(
          record(record(operation.requestBody).content)['application/json'],
        ).schema,
      );
      expect(schema.additionalProperties).toBe(false);
      expect(record(schema.properties)[scenario.parameter]).toBeUndefined();
      expect(Object.keys(record(schema.properties)).toSorted()).toEqual(
        Object.keys(scenario.body ?? {}).toSorted(),
      );
    }
  });
});
