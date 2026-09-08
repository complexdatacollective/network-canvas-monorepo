import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '~/app/api/health/route';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as { APP_VERSION?: string; EXPOSE_HEALTH_DETAILS?: boolean },
}));
vi.mock('~/env.js', () => ({ env: mockEnv }));

const STAMPED_VERSION = 'v9.9.9';

type HealthBody = {
  status: string;
  uptime?: number;
  version?: string;
  checks: { name: string; status: string }[];
};

const probe = async () => {
  const response = GET(new NextRequest('http://localhost/api/health'));
  const body = (await response.json()) as HealthBody;
  return { response, body };
};

beforeEach(() => {
  mockEnv.APP_VERSION = STAMPED_VERSION;
  delete mockEnv.EXPOSE_HEALTH_DETAILS;
});

describe('GET /api/health', () => {
  it('answers an anonymous liveness probe without naming the version or uptime', async () => {
    const { response, body } = await probe();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks).toEqual([
      expect.objectContaining({ name: 'basic', status: 'healthy' }),
    ]);
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('uptime');
    // The whole payload, not only the two top-level keys: a check's details
    // must not carry them either.
    const payload = JSON.stringify(body);
    expect(payload).not.toContain(STAMPED_VERSION);
    expect(payload).not.toContain('uptime');
  });

  it('withholds the details when the opt-in is explicitly off', async () => {
    mockEnv.EXPOSE_HEALTH_DETAILS = false;

    const { body } = await probe();

    expect(JSON.stringify(body)).not.toContain(STAMPED_VERSION);
    expect(body).not.toHaveProperty('uptime');
  });

  it('reports the version and uptime once the deployer opts in', async () => {
    mockEnv.EXPOSE_HEALTH_DETAILS = true;

    const { response, body } = await probe();

    expect(response.status).toBe(200);
    expect(body.version).toBe(STAMPED_VERSION);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('reports an unknown version when the build stamped none', async () => {
    mockEnv.EXPOSE_HEALTH_DETAILS = true;
    delete mockEnv.APP_VERSION;

    const { body } = await probe();

    expect(body.version).toBe('unknown');
  });

  it('forbids caching so every probe reflects the live process', async () => {
    const { response } = await probe();

    expect(response.headers.get('cache-control')).toBe(
      'no-cache, no-store, must-revalidate',
    );
  });
});
