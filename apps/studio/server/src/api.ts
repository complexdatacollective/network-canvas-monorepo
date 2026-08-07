import { createRoute, OpenAPIHono } from '@hono/zod-openapi';

import { StatusSchema } from '../../shared/api-schemas.ts';
import { STUDIO_VERSION } from './version.ts';

// The public API surface, per the API ADR (#1248): REST routes defined with
// @hono/zod-openapi so one Zod schema yields runtime validation and the
// published OpenAPI document. The 3.1 document is normative and is served
// from within the versioned path it describes.

const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  summary: 'Instance status',
  responses: {
    200: {
      description: 'The Studio instance name and version.',
      content: {
        'application/json': { schema: StatusSchema },
      },
    },
  },
});

export function createApiV1() {
  const api = new OpenAPIHono();

  api.openapi(statusRoute, (c) =>
    c.json({ name: 'Network Canvas Studio', version: STUDIO_VERSION }, 200),
  );

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Network Canvas Studio API',
      version: 'v1',
    },
  });

  return api;
}
