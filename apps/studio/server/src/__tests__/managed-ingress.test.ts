import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.ts';
import { createDisabledAuthService } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { createObservability } from '../observability/runtime.ts';

const INGRESS_SECRET =
  'synthetic-managed-ingress-secret-at-least-32-characters';
const METRICS_TOKEN = 'synthetic-managed-metrics-token-at-least-32-characters';
const TRUSTED_PROXIES = ['fdaa::/16'];

describe('managed ingress proof', () => {
  it('refuses a managed database HTTP app without both ingress proofs', () => {
    const base = readEnv();
    for (const ingress of [
      { managedIngressSecret: undefined, trustedProxies: [] },
      {
        managedIngressSecret: INGRESS_SECRET,
        trustedProxies: [],
      },
      {
        managedIngressSecret: undefined,
        trustedProxies: TRUSTED_PROXIES,
      },
      {
        managedIngressSecret: INGRESS_SECRET,
        trustedProxies: ['not-a-proxy'],
      },
    ]) {
      expect(() =>
        createApp({
          ...base,
          deploymentMode: 'managed',
          db: { url: 'postgresql://synthetic.invalid/studio' },
          ...ingress,
        }),
      ).toThrow(
        'Managed Studio HTTP with a database requires STUDIO_MANAGED_INGRESS_SECRET and TRUSTED_PROXIES',
      );
    }
  });

  it('admits a managed database HTTP app only with both ingress proofs', async () => {
    const base = readEnv();
    const app = createApp({
      ...base,
      deploymentMode: 'managed',
      db: { url: 'postgresql://synthetic.invalid/studio' },
      maintenanceDb: undefined,
      auth: undefined,
      managedIngressSecret: INGRESS_SECRET,
      trustedProxies: TRUSTED_PROXIES,
    });
    const refused = await app.request('/api/v1/status');
    expect(refused.status).toBe(404);
    const admitted = await app.request('/api/v1/status', {
      headers: { 'x-studio-managed-ingress-proof': INGRESS_SECRET },
    });
    expect(admitted.status).toBe(200);
  });

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
        trustedProxies: TRUSTED_PROXIES,
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
      trustedProxies: TRUSTED_PROXIES,
    });
    const response = await app.request('/api/auth/get-session', {
      headers: { 'x-studio-managed-ingress-proof': INGRESS_SECRET },
    });
    expect(response.status).toBe(503);
    const health = await app.request('/healthz');
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
  });

  it('checks ingress proof before invoking the shared readiness handler', async () => {
    const observability = createObservability({});
    const check = vi.spyOn(observability.readiness, 'check');
    try {
      const app = createApp(
        {
          ...readEnv(),
          db: undefined,
          maintenanceDb: undefined,
          auth: undefined,
          managedIngressSecret: INGRESS_SECRET,
          trustedProxies: TRUSTED_PROXIES,
        },
        { observability },
      );
      for (const proof of [undefined, 'wrong-proof']) {
        const response = await app.request('/readyz', {
          headers: proof
            ? { 'x-studio-managed-ingress-proof': proof }
            : undefined,
        });
        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect(check).not.toHaveBeenCalled();
      const admitted = await app.request('/readyz', {
        headers: { 'x-studio-managed-ingress-proof': INGRESS_SECRET },
      });
      // This fixture has no database: an admitted probe reports not-ready.
      expect(admitted.status).toBe(503);
      await expect(admitted.json()).resolves.toMatchObject({
        status: 'not_ready',
      });
      expect(check).toHaveBeenCalledOnce();
    } finally {
      check.mockRestore();
      observability.stop();
    }
  });

  it('keeps exact metrics behind its bearer gate without ingress proof', async () => {
    const base = readEnv();
    const configured = createApp({
      ...base,
      db: undefined,
      maintenanceDb: undefined,
      auth: undefined,
      metricsToken: METRICS_TOKEN,
      managedIngressSecret: INGRESS_SECRET,
      trustedProxies: TRUSTED_PROXIES,
    });

    const wrong = await configured.request('/metrics', {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(wrong.status).toBe(404);
    const valid = await configured.request('/metrics', {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(valid.status).toBe(200);
    expect(await valid.text()).toContain('studio_http_requests_total');

    const wrongMethod = await configured.request('/metrics', {
      method: 'POST',
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(wrongMethod.status).toBe(404);
    const variant = await configured.request('/metrics/extra', {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(variant.status).toBe(404);

    const unconfigured = createApp({
      ...base,
      db: undefined,
      maintenanceDb: undefined,
      auth: undefined,
      metricsToken: undefined,
      managedIngressSecret: INGRESS_SECRET,
      trustedProxies: TRUSTED_PROXIES,
    });
    const hidden = await unconfigured.request('/metrics');
    expect(hidden.status).toBe(404);
  });
});
