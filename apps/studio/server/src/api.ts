import { oc } from '@orpc/contract';
import { OpenAPIGenerator, openapi, type OpenAPIDocument } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { COMMON_ERROR_STATUS_MAP, implement } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  type AuthCapabilities,
  type DeploymentStatus,
  getInstanceStatus,
} from './domain.ts';

// The public data API (#1248): resource-shaped REST for researchers and
// external tools, with the normative OpenAPI 3.1 document served from within
// the versioned path it describes, and errors leaving as RFC 9457 problem
// details. Per the 2026-08-11 decision on #1248 this surface is fully
// separate from the SPA's internal RPC surface (src/rpc.ts): its contract
// and schemas live here, in the server — its only consumer in this repo —
// and its routes are designed for analysis workflows, not app screens. Both
// surfaces are thin adapters over the domain layer (src/domain.ts).

const StatusSchema = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  // Named spec components come from Zod's registry via `.meta({ id })`.
  .meta({ id: 'Status' });

const apiContract = {
  status: oc
    .meta(
      openapi({ method: 'GET', path: '/status', summary: 'Instance status' }),
    )
    .output(StatusSchema),
};

const os = implement(apiContract);

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

const ERROR_STATUS_MAP: Record<string, number> = COMMON_ERROR_STATUS_MAP;

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

export function createApiV1(
  auth: AuthCapabilities,
  deployment: DeploymentStatus,
) {
  // The domain's status includes auth capabilities and the deployment block
  // for the SPA; this surface's Status schema deliberately names neither, so
  // both are stripped from the published API (output schemas are the
  // serialization allowlist).
  const apiRouter = {
    status: os.status.handler(() => getInstanceStatus(auth, deployment)),
  };

  const handler = new OpenAPIHandler(apiRouter, {
    // Errors leave the public surface as RFC 9457 problem details, never as
    // oRPC's native error shape. Omitted `type` defaults to "about:blank".
    customErrorResponseBodyEncoder: (error) => {
      const status = ERROR_STATUS_MAP[error.code] ?? 500;
      return {
        title: STATUS_TITLES[status] ?? 'Error',
        status,
        detail: error.message,
      };
    },
  });

  const api = new Hono();

  let doc: OpenAPIDocument | undefined;
  api.get('/openapi.json', async (c) => {
    doc ??= await generator.generate(apiRouter, {
      base: {
        info: {
          title: 'Network Canvas Studio API',
          version: 'v1',
        },
        // Generated paths are relative to the mount prefix; without this
        // base, tooling would resolve /status against the host root and
        // miss the API.
        servers: [{ url: '/api/v1' }],
      },
    });
    return c.json(doc);
  });

  api.use('*', async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: '/api/v1',
    });
    if (!matched) return next();
    const headers = new Headers(response.headers);
    // The handler emits errors as application/json; the problem media type
    // is applied here, the layer that owns the HTTP response.
    if (
      response.status >= 400 &&
      headers.get('Content-Type')?.includes('application/json')
    ) {
      headers.set('Content-Type', 'application/problem+json');
    }
    return new Response(response.body, { status: response.status, headers });
  });

  return api;
}
