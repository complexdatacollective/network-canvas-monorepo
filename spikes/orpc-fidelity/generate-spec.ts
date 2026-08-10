import { writeFileSync } from 'node:fs';

import { OpenAPIGenerator, openapi } from '@orpc/openapi';
import { os } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { z } from 'zod';

import {
  EntitySchema,
  SessionEventSchema,
  SessionPageSchema,
  SessionSchema,
} from './schemas.ts';

// Same four routes as spikes/openapi-fidelity/generate-spec.ts, expressed as
// oRPC v2 procedures. Path params merge into the input object ('compact'
// input structure); GET puts non-param input keys in the query string.

const listSessions = os
  .meta(
    openapi({
      method: 'GET',
      path: '/studies/{studyId}/sessions',
      operationId: 'listSessions',
    }),
  )
  .input(
    z.object({
      studyId: z.uuid(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  )
  .output(SessionPageSchema)
  .handler(() => ({ data: [], next_cursor: null, has_more: false }));

const getSession = os
  .meta(
    openapi({
      method: 'GET',
      path: '/sessions/{sessionId}',
      operationId: 'getSession',
    }),
  )
  .input(z.object({ sessionId: z.uuid() }))
  .output(SessionSchema)
  .handler(() => null as never);

const getEntity = os
  .meta(
    openapi({
      method: 'GET',
      path: '/sessions/{sessionId}/entities/{entityId}',
      operationId: 'getEntity',
    }),
  )
  .input(z.object({ sessionId: z.uuid(), entityId: z.uuid() }))
  .output(EntitySchema)
  .handler(() => null as never);

const listEvents = os
  .meta(
    openapi({
      method: 'GET',
      path: '/studies/{studyId}/events',
      operationId: 'listEvents',
    }),
  )
  .input(z.object({ studyId: z.uuid() }))
  .output(z.array(SessionEventSchema))
  .handler(() => []);

const router = { listSessions, getSession, getEntity, listEvents };

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const doc = await generator.generate(router, {
  base: {
    info: { title: 'Studio oRPC fidelity spike', version: '0.0.1' },
  },
});

writeFileSync('openapi-3.1.json', JSON.stringify(doc, null, 2));
console.log('wrote openapi-3.1.json (openapi:', doc.openapi + ')');
