// Reproduce the #1248 spike's headline hazard against the Zod-native chain:
// does use-site .nullable() on a registered (.meta({id})) component mutate the
// shared component in the generated document?
import { OpenAPIGenerator, openapi } from '@orpc/openapi';
import { os } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { z } from 'zod';

import { SessionEventSchema } from './schemas.ts';

const SessionSchema = z
  .object({
    id: z.uuid(),
    lastEvent: SessionEventSchema.nullable(), // the hazard pattern
  })
  .meta({ id: 'HazardSession' });

const getSession = os
  .meta(openapi({ method: 'GET', path: '/sessions/{sessionId}' }))
  .input(z.object({ sessionId: z.uuid() }))
  .output(SessionSchema)
  .handler(() => null as never);

const doc = await new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
}).generate(
  { getSession },
  { base: { info: { title: 'hazard', version: '0' } } },
);

const comps = (doc as any).components.schemas;
console.log('SessionEvent component:', JSON.stringify(comps.SessionEvent));
console.log(
  'lastEvent property:',
  JSON.stringify(comps.HazardSession.properties.lastEvent),
);
