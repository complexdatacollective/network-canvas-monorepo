import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import { createDisabledAuthService } from '../auth/service.ts';
import { readEnv } from '../env.ts';

const INGRESS_SECRET =
  'synthetic-managed-ingress-secret-at-least-32-characters';

describe('managed ingress proof', () => {
  it('refuses missing or mismatched proof before serving a route', async () => {
    const base = readEnv();
    let authCalls = 0;
    const disabledAuth = createDisabledAuthService();
    const app = createApp(
      {
        ...base,
        db: undefined,
        maintenanceDb: undefined,
        auth: undefined,
        managedIngressSecret: INGRESS_SECRET,
      },
      {
        auth: {
          ...disabledAuth,
          handler(request) {
            authCalls += 1;
            return disabledAuth.handler(request);
          },
        },
      },
    );

    for (const proof of [
      undefined,
      'wrong-managed-ingress-secret-at-least-32-chars',
    ]) {
      const response = await app.request('/api/auth/get-session', {
        headers: proof
          ? { 'x-studio-managed-ingress-proof': proof }
          : undefined,
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        title: 'Not Found',
        status: 404,
      });
    }
    expect(authCalls).toBe(0);
  });

  it('serves auth only through an exact proof while retaining direct liveness', async () => {
    const base = readEnv();
    const app = createApp({
      ...base,
      db: undefined,
      maintenanceDb: undefined,
      auth: undefined,
      managedIngressSecret: INGRESS_SECRET,
    });
    const response = await app.request('/api/auth/get-session', {
      headers: { 'x-studio-managed-ingress-proof': INGRESS_SECRET },
    });
    expect(response.status).toBe(503);
    const health = await app.request('/healthz');
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
  });
});
