import { writeFileSync } from 'node:fs';

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

// Default schema module is the disciplined one; pass
// `node generate-spec.ts schemas-nullable-hazard.ts` to reproduce the
// registered-component contamination findings.
const schemaModule = process.argv[2] ?? './schemas.ts';
const {
  EntitySchema,
  ProblemSchema,
  SessionEventSchema,
  SessionPageSchema,
  SessionSchema,
} = (await import(
  schemaModule.startsWith('.') ? schemaModule : `./${schemaModule}`
)) as typeof import('./schemas.ts');

const app = new OpenAPIHono();

const problemResponse = {
  content: { 'application/problem+json': { schema: ProblemSchema } },
  description: 'Problem details',
};

app.openapi(
  createRoute({
    method: 'get',
    path: '/studies/{studyId}/sessions',
    operationId: 'listSessions',
    request: {
      params: z.object({ studyId: z.uuid() }),
      query: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: SessionPageSchema } },
        description: 'A page of sessions',
      },
      404: problemResponse,
    },
  }),
  (c) => c.json({ data: [], next_cursor: null, has_more: false }, 200),
)

app.openapi(
  createRoute({
    method: 'get',
    path: '/sessions/{sessionId}',
    operationId: 'getSession',
    request: { params: z.object({ sessionId: z.uuid() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: SessionSchema } },
        description: 'A session with its network payload',
      },
      404: problemResponse,
    },
  }),
  // Handler bodies are irrelevant to the spec; this route only needs to exist.
  (c) => c.json(null as never, 200),
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/sessions/{sessionId}/entities/{entityId}',
    operationId: 'getEntity',
    request: {
      params: z.object({ sessionId: z.uuid(), entityId: z.uuid() }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: EntitySchema } },
        description: 'A network entity (node, edge, or ego)',
      },
      404: problemResponse,
    },
  }),
  (c) => c.json(null as never, 200),
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/studies/{studyId}/events',
    operationId: 'listEvents',
    request: { params: z.object({ studyId: z.uuid() }) },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.array(SessionEventSchema) },
        },
        description: 'Session lifecycle events',
      },
    },
  }),
  (c) => c.json([], 200),
);

const info = { title: 'Studio OpenAPI fidelity spike', version: '0.0.1' };

const doc31 = app.getOpenAPI31Document({ openapi: '3.1.0', info });
writeFileSync('openapi-3.1.json', JSON.stringify(doc31, null, 2));

const doc30 = app.getOpenAPIDocument({ openapi: '3.0.3', info });
writeFileSync('openapi-3.0.json', JSON.stringify(doc30, null, 2));

console.log('wrote openapi-3.1.json and openapi-3.0.json');
