import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '~/app/api/health/route';

type HealthBody = {
  status: string;
  checks: Record<string, unknown>[];
};

const probe = async () => {
  const response = GET(new NextRequest('http://localhost/api/health'));
  const body = (await response.json()) as HealthBody;
  return { response, body };
};

describe('GET /api/health', () => {
  it('answers a liveness probe with the status and nothing that identifies the build', async () => {
    const { response, body } = await probe();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    // The exact key set, so that any field added to the anonymous response —
    // a version, an uptime, a Node.js version — fails here rather than
    // shipping unnoticed.
    expect(Object.keys(body).toSorted()).toEqual([
      'checks',
      'duration',
      'status',
      'timestamp',
    ]);
    expect(body.checks).toHaveLength(1);
    expect(Object.keys(body.checks[0] ?? {}).toSorted()).toEqual([
      'duration',
      'name',
      'status',
    ]);
    expect(body.checks[0]).toMatchObject({ name: 'basic', status: 'healthy' });
  });

  it('forbids caching so every probe reflects the live process', async () => {
    const { response } = await probe();

    expect(response.headers.get('cache-control')).toBe(
      'no-cache, no-store, must-revalidate',
    );
  });
});
