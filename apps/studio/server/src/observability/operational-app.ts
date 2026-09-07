import { Hono } from 'hono';

import type { PrincipalVariables } from '../auth/principal.ts';
import type { StudioEnv } from '../env.ts';
import type { OperationalLogger } from './logger.ts';
import { observeRequests } from './requests.ts';
import { authorizeMetrics, type createObservability } from './runtime.ts';

/** Shared operational HTTP surface; worker processes expose only this app. */
export function createOperationalApp(
  env: Pick<StudioEnv, 'metricsToken' | 'trustedProxies'>,
  observability: ReturnType<typeof createObservability>,
  logger?: OperationalLogger,
  reportError?: (error: unknown) => void,
) {
  const app = new Hono<PrincipalVariables>();
  app.onError((error, c) => {
    reportError?.(error);
    return c.json({ title: 'Internal Server Error', status: 500 }, 500, {
      'Content-Type': 'application/problem+json',
    });
  });
  app.use(
    '*',
    observeRequests({
      trustedProxies: env.trustedProxies,
      logger,
      record: observability.metrics.request,
    }),
  );
  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    const readiness = await observability.readiness.check();
    return c.json(readiness, readiness.status === 'ready' ? 200 : 503, {
      'Cache-Control': 'no-store',
    });
  });
  app.get('/metrics', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!env.metricsToken)
      return c.json({ title: 'Not Found', status: 404 }, 404);
    if (!authorizeMetrics(c.req.header('authorization'), env.metricsToken))
      return c.json({ title: 'Unauthorized', status: 401 }, 401, {
        'WWW-Authenticate': 'Bearer',
      });
    const metrics = await observability.metrics.scrape();
    return c.body(metrics.body, 200, { 'Content-Type': metrics.contentType });
  });
  return app;
}
