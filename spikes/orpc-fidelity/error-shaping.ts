// Verification: can oRPC v2 error responses be shaped to RFC 9457 problem
// details (the API ADR's convention) on the wire AND in the generated spec?
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIGenerator, openapi } from '@orpc/openapi';
import { os, ORPCError } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { Hono } from 'hono';
import { z } from 'zod';

const SessionSchema = z
  .object({ id: z.uuid(), status: z.string() })
  .meta({ id: 'Session' });

const getSession = os
  .meta(
    openapi({ method: 'GET', path: '/sessions/{sessionId}' }),
  )
  .errors({
    NOT_FOUND: {
      data: z.object({ resource: z.literal('session') }),
    },
  })
  .input(z.object({ sessionId: z.uuid() }))
  .output(SessionSchema)
  .handler(({ input, errors }) => {
    throw errors.NOT_FOUND({
      message: `No session exists with ID ${input.sessionId}.`,
      data: { resource: 'session' },
    });
  });

const router = { getSession };

// --- 1. Default error body (for comparison) ------------------------------

const defaultHandler = new OpenAPIHandler(router);

// --- 2. RFC 9457-shaped error body via customErrorResponseBodyEncoder ----

const STATUS_TITLES: Record<number, string> = {
  404: 'Not Found',
  500: 'Internal Server Error',
};

const ERROR_STATUS_MAP = { NOT_FOUND: 404 };

const problemHandler = new OpenAPIHandler(router, {
  errorStatusMap: ERROR_STATUS_MAP,
  customErrorResponseBodyEncoder: (error) => {
    const status =
      ERROR_STATUS_MAP[error.code as keyof typeof ERROR_STATUS_MAP] ?? 500;
    return {
      type: `https://studio.networkcanvas.com/problems/${error.code.toLowerCase()}`,
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail: error.message,
    };
  },
});

const ID = '3b241101-e2bb-4255-8caf-4136c566a962';

for (const [label, handler] of [
  ['default encoder', defaultHandler],
  ['problem encoder', problemHandler],
] as const) {
  const { response } = await handler.handle(
    new Request(`http://x/sessions/${ID}`),
    { prefix: '/' },
  );
  console.log(
    `${label}: ${response?.status} ${response?.headers.get('content-type')}`,
  );
  console.log(' body:', await response?.text());
}

// --- 3. Content-type fix at the Hono mount (the layer we control) --------

const app = new Hono();
app.use('/api/v1/*', async (c, next) => {
  const { matched, response } = await problemHandler.handle(c.req.raw, {
    prefix: '/api/v1',
  });
  if (matched) {
    if (
      response.status >= 400 &&
      response.headers.get('content-type')?.includes('application/json')
    ) {
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/problem+json');
      return c.newResponse(response.body, {
        status: response.status,
        headers,
      });
    }
    return c.newResponse(response.body, response);
  }
  await next();
});

const res = await app.fetch(new Request(`http://x/api/v1/sessions/${ID}`));
console.log('via Hono mount:', res.status, res.headers.get('content-type'));
console.log(' body:', await res.text());

// --- 4. The spec side: customErrorResponseBodySchema ---------------------

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const doc = await generator.generate(router, {
  base: { info: { title: 'error shaping', version: '0' } },
  errorStatusMap: ERROR_STATUS_MAP,
  customErrorResponseBodySchema: (definedErrors, status) => ({
    type: 'object',
    properties: {
      type: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      status: { type: 'integer', const: status },
      detail: { type: 'string' },
    },
    required: ['type', 'title', 'status'],
    examples: definedErrors.map((e) => ({
      type: `https://studio.networkcanvas.com/problems/${e.code.toLowerCase()}`,
      title: 'Not Found',
      status,
      detail: e.defaultMessage ?? 'The requested resource does not exist.',
    })),
  }),
});

const op = (doc as any).paths['/sessions/{sessionId}'].get;
console.log('\nspec responses:', Object.keys(op.responses));
console.log(
  'spec 404:',
  JSON.stringify(op.responses['404'], null, 1).slice(0, 900),
);
