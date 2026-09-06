import { randomUUID } from 'node:crypto';

import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { implement, ORPCError } from '@orpc/server';
import { Hono } from 'hono';

import {
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
} from '@codaco/studio-sync/template-exchange';

import type { RegistryAuth } from './auth/service.ts';
import { readBytesCapped } from './body.ts';
import { generateRegistryOpenApi, registryContract } from './contract.ts';
import {
  ProblemContextSchema,
  RegistryError,
  registryProblem,
  registryErrorStatuses,
  isRegistryProblemCode,
  type RegistryProblemCode,
} from './problems.ts';
import { retainArtifactResponse } from './response-body.ts';
import {
  retainArtifactTransport,
  type RegistryResponse,
} from './response-lifecycle.ts';
import type { RegistryStore } from './store.ts';

const os = implement(registryContract).$context<{
  request: Request;
  requestId: string;
}>();
function bearer(request: Request): string {
  const match = /^Bearer (ncr1_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get('authorization') ?? '',
  );
  if (!match?.[1]) throw new RegistryError('AUTHENTICATION_REQUIRED');
  return match[1];
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RegistryError)
      throw new ORPCError(error.code, {
        message: error.message,
        data: error.context,
      });
    throw error;
  }
}
function publicCode(code: string): RegistryProblemCode {
  if (isRegistryProblemCode(code)) return code;
  if (code === 'BAD_REQUEST' || code === 'UNPROCESSABLE_CONTENT')
    return 'INVALID_REQUEST';
  if (code === 'UNAUTHORIZED') return 'AUTHENTICATION_REQUIRED';
  return 'INTERNAL_SERVER_ERROR';
}

export type RegistryAppDependencies = {
  store: RegistryStore;
  auth: RegistryAuth;
  accepting: () => boolean;
  ready: () => Promise<boolean>;
  onDiagnostic: (
    code: 'REGISTRY_REQUEST_FAILED' | 'REGISTRY_READINESS_FAILED',
    requestId: string,
  ) => void;
};

export function createRegistryApp({
  store,
  auth,
  accepting,
  ready,
  onDiagnostic,
}: RegistryAppDependencies) {
  const router = {
    listEntries: os.listEntries.handler(({ input }) =>
      invoke(() => store.list(input)),
    ),
    entry: os.entry.handler(({ input }) =>
      invoke(() => store.entry(input.params.id)),
    ),
    artifact: os.artifact.handler(({ input, context }) =>
      invoke(async () => {
        const artifact = await store.artifact(input.params.root);
        if (context.request.signal.aborted)
          throw new RegistryError('REQUEST_TIMEOUT');
        return {
          headers: {
            'content-type': TEMPLATE_ARTIFACT_MEDIA_TYPE,
            'content-disposition': `attachment; filename="${input.params.root}.nctemplate"`,
            'cache-control': 'no-store' as const,
            'etag': `"${artifact.rawHash}"`,
            'x-template-root': input.params.root,
            'x-registry-yanked': artifact.yanked
              ? ('true' as const)
              : ('false' as const),
          },
          body: new File(
            [Uint8Array.from(artifact.bytes)],
            `${input.params.root}.nctemplate`,
            { type: TEMPLATE_ARTIFACT_MEDIA_TYPE },
          ),
        };
      }),
    ),
    publish: os.publish.handler(({ input, context }) =>
      invoke(async () =>
        store.publish(
          bearer(context.request),
          new Uint8Array(await input.artifact.arrayBuffer()),
          context.requestId,
        ),
      ),
    ),
    yank: os.yank.handler(({ input, context }) =>
      invoke(() =>
        store.yank(bearer(context.request), input.params.id, context.requestId),
      ),
    ),
    report: os.report.handler(({ input }) =>
      invoke(() => store.report(input.params.id, input.body)),
    ),
    me: os.me.handler(({ context }) =>
      invoke(() => store.publisher(bearer(context.request))),
    ),
    claimPublisher: os.claimPublisher.handler(({ input, context }) =>
      invoke(() =>
        store.claimPublisher(context.request.headers, input, context.requestId),
      ),
    ),
    createToken: os.createToken.handler(({ input, context }) =>
      invoke(() =>
        store.createToken(context.request.headers, input, context.requestId),
      ),
    ),
    listTokens: os.listTokens.handler(({ context }) =>
      invoke(() => store.listTokens(context.request.headers)),
    ),
    revokeToken: os.revokeToken.handler(({ input, context }) =>
      invoke(async () => {
        await store.revokeToken(
          context.request.headers,
          input.params.id,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    takedown: os.takedown.handler(({ input, context }) =>
      invoke(async () => {
        await store.visibility(
          bearer(context.request),
          input.params.id,
          true,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    restore: os.restore.handler(({ input, context }) =>
      invoke(async () => {
        await store.visibility(
          bearer(context.request),
          input.params.id,
          false,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    hardDelete: os.hardDelete.handler(({ input, context }) =>
      invoke(async () => {
        await store.hardDelete(
          bearer(context.request),
          input.params.root,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    suspendPublisher: os.suspendPublisher.handler(({ input, context }) =>
      invoke(async () => {
        await store.suspend(
          bearer(context.request),
          input.params.id,
          input.body.suspended,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    curate: os.curate.handler(({ input, context }) =>
      invoke(async () => {
        await store.curate(
          bearer(context.request),
          input.params.id,
          input.body.curated,
          context.requestId,
        );
        return { ok: true as const };
      }),
    ),
    reports: os.reports.handler(({ input, context }) =>
      invoke(() =>
        store.reports(bearer(context.request), input.after, input.limit),
      ),
    ),
  };
  const app = new Hono<{
    Bindings: { outgoing?: RegistryResponse };
    Variables: { requestId: string };
  }>();
  let activeArtifactUnits = 0;
  let openapi: Awaited<ReturnType<typeof generateRegistryOpenApi>> | undefined;

  app.use('*', async (context, next) => {
    const requestId = randomUUID();
    context.set('requestId', requestId);
    await next();
    context.header('X-Request-ID', requestId);
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Cache-Control', 'no-store');
    context.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    );
  });
  app.use('*', async (context, next) => {
    if (!accepting() && !['/healthz', '/readyz'].includes(context.req.path))
      throw new RegistryError('SERVICE_UNAVAILABLE');
    await next();
  });
  app.onError((error, context) => {
    const code =
      error instanceof RegistryError ? error.code : 'INTERNAL_SERVER_ERROR';
    if (code === 'INTERNAL_SERVER_ERROR')
      onDiagnostic('REGISTRY_REQUEST_FAILED', context.get('requestId'));
    const body = registryProblem(
      code,
      context.get('requestId'),
      error instanceof RegistryError ? error.context : undefined,
    );
    const headers = new Headers({ 'Content-Type': 'application/problem+json' });
    if (body.context?.retry_after_seconds)
      headers.set('Retry-After', String(body.context.retry_after_seconds));
    return new Response(JSON.stringify(body), { status: body.status, headers });
  });
  app.get('/healthz', (context) => context.json({ status: 'ok' }));
  app.get('/readyz', async (context) => {
    try {
      if (await ready()) return context.json({ status: 'ready' });
    } catch {
      onDiagnostic('REGISTRY_READINESS_FAILED', context.get('requestId'));
    }
    return context.json({ status: 'unavailable' }, 503);
  });
  app.all('/api/auth/*', async (context) => {
    const original = context.req.raw;
    if (original.method !== 'POST') return auth.handler(original);
    const maximum = 32 * 1024;
    const declared = Number(original.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximum)
      throw new RegistryError('CONTENT_TOO_LARGE');
    const bytes = await readBytesCapped(
      original.body,
      maximum,
      AbortSignal.any([original.signal, AbortSignal.timeout(15_000)]),
    );
    // The Node adapter's lightweight Request has no native internal slots.
    // Reconstruct concrete metadata after bounded body consumption.
    return auth.handler(
      new Request(original.url, {
        method: original.method,
        headers: original.headers,
        signal: original.signal,
        body: bytes,
      }),
    );
  });
  app.get('/api/v1/openapi.json', async (context) => {
    openapi ??= await generateRegistryOpenApi();
    return context.json(openapi);
  });
  app.all('/api/v1/*', async (context) => {
    const original = context.req.raw;
    const publish =
      original.method === 'POST' &&
      new URL(original.url).pathname.replace(/\/$/, '') === '/api/v1/entries';
    const download =
      ['GET', 'HEAD'].includes(original.method) &&
      new URL(original.url).pathname.startsWith('/api/v1/artifacts/');
    // Multipart intake and archive validation retain more copies than a
    // download. Reserve the whole budget for one publication so the bounded
    // 512 MiB service can also accommodate its database/auth/HTTP work.
    const artifactUnits = publish ? 2 : 1;
    let artifactSlot = false;
    let completeTransport: (() => void) | undefined;
    try {
      if (publish) {
        await store.admitPublish(bearer(original));
      }
      if (publish || download) {
        if (activeArtifactUnits + artifactUnits > 2)
          throw new RegistryError('SERVICE_UNAVAILABLE', {
            retry_after_seconds: 1,
          });
        activeArtifactUnits += artifactUnits;
        artifactSlot = true;
        if (download && context.env?.outgoing) {
          completeTransport = retainArtifactTransport(
            context.env.outgoing,
            () => {
              activeArtifactUnits -= artifactUnits;
            },
          );
          artifactSlot = false;
        }
      }
      let request = original;
      if (!['GET', 'HEAD'].includes(original.method)) {
        const maximum = publish
          ? TEMPLATE_ARTIFACT_LIMITS.archiveBytes + 64 * 1024
          : 32 * 1024;
        const declared = Number(original.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maximum)
          throw new RegistryError('CONTENT_TOO_LARGE');
        const bytes = await readBytesCapped(
          original.body,
          maximum,
          AbortSignal.any([original.signal, AbortSignal.timeout(15_000)]),
        );
        request = new Request(original.url, {
          method: original.method,
          headers: original.headers,
          signal: original.signal,
          body: bytes,
        });
      }
      // The encoder is scoped to this request so correlation cannot leak
      // between overlapping handlers or depend on process-global context.
      let retryAfter: number | undefined;
      const handler = new OpenAPIHandler(router, {
        errorStatusMap: registryErrorStatuses,
        customErrorResponseBodyEncoder: (error) => {
          const code = publicCode(error.code);
          if (code === 'INTERNAL_SERVER_ERROR')
            onDiagnostic('REGISTRY_REQUEST_FAILED', context.get('requestId'));
          const parsed = ProblemContextSchema.safeParse(error.data);
          if (parsed.success) retryAfter = parsed.data?.retry_after_seconds;
          return registryProblem(
            code,
            context.get('requestId'),
            parsed.success ? parsed.data : undefined,
          );
        },
      });
      const result = await handler.handle(request, {
        prefix: '/api/v1',
        context: { request, requestId: context.get('requestId') },
      });
      if (!result.matched) throw new RegistryError('NOT_FOUND');
      const headers = new Headers(result.response.headers);
      if (retryAfter !== undefined)
        headers.set('Retry-After', String(retryAfter));
      if (result.response.status >= 400)
        headers.set('Content-Type', 'application/problem+json');
      if (
        download &&
        !completeTransport &&
        original.method === 'GET' &&
        result.response.ok &&
        result.response.body
      ) {
        const body = retainArtifactResponse(
          result.response.body,
          original.signal,
          () => {
            activeArtifactUnits -= artifactUnits;
          },
        );
        artifactSlot = false;
        return new Response(body, { status: result.response.status, headers });
      }
      if (original.method === 'HEAD') {
        void result.response.body?.cancel().catch(() => undefined);
        return new Response(null, { status: result.response.status, headers });
      }
      return new Response(result.response.body, {
        status: result.response.status,
        headers,
      });
    } finally {
      completeTransport?.();
      if (artifactSlot) activeArtifactUnits -= artifactUnits;
    }
  });
  app.notFound((context) => {
    const body = registryProblem('NOT_FOUND', context.get('requestId'));
    return new Response(JSON.stringify(body), {
      status: 404,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  });
  return app;
}
