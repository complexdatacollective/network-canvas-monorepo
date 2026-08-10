import { OpenAPIGenerator, type OpenAPIDocument } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { COMMON_ERROR_STATUS_MAP } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { Hono } from 'hono';

import { appRouter } from './router.ts';

// The public API surface, per the API ADR (#1248): the REST routes and the
// published OpenAPI 3.1 document are generated from the same oRPC contract
// the SPA's typed procedures implement — one Zod source of truth. The
// document is normative and is served from within the versioned path it
// describes.

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

const ERROR_STATUS_MAP: Record<string, number> = COMMON_ERROR_STATUS_MAP;

const handler = new OpenAPIHandler(appRouter, {
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

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

export function createApiV1() {
  const api = new Hono();

  let doc: OpenAPIDocument | undefined;
  api.get('/openapi.json', async (c) => {
    doc ??= await generator.generate(appRouter, {
      base: {
        info: {
          title: 'Network Canvas Studio API',
          version: 'v1',
        },
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
