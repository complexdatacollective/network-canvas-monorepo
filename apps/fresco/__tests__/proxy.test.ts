import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { isPublicParticipantPath, proxy } from '~/proxy';

/**
 * A signed-in researcher's session cookie. Proxy never reads it — closing
 * this gap only depends on the path, not on whether the session is real —
 * but every case below carries one to prove the block (and the pass-through)
 * hold regardless of an attacker also having a valid session.
 */
const SESSION_COOKIE = 'auth_session=abc123';

function nextActionRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Next-Action': '60f0c9b1234567890abcdef1234567890abcdef',
      'Cookie': SESSION_COOKIE,
    },
  });
}

/**
 * The only routes a participant reaches without signing in. None of them
 * binds a Server Action — verified by searching the interview and onboard
 * trees for 'use server' imports reachable from a client component — so a
 * request naming one here, whatever URL it targets, is never legitimate
 * traffic and always denotes an attempt to reach a researcher-only action
 * through a route an institutional reverse proxy would otherwise leave open.
 */
const PUBLIC_SERVER_ACTION_ROUTES = [
  '/interview/clzq3n5p40000356m1a2b3c4d',
  '/interview/clzq3n5p40000356m1a2b3c4d/sync',
  '/interview/finished',
  '/onboard/clzq3n5p40001356m1a2b3c4d',
  '/onboard/clzq3n5p40001356m1a2b3c4d/',
  '/api/assets/some-protocol-asset.png',
  '/api/uploadthing',
  '/api/health',
  '/api/interviews/clzq3n5p40000356m1a2b3c4d/finish',
];

/**
 * Researcher and infrastructure routes. The dashboard is reachable from the
 * public Internet by default — the network restriction in the IT FAQ is an
 * optional deployment choice, not something Fresco enforces itself — so a
 * genuine dashboard Server Action must keep working unmodified here.
 */
const RESEARCHER_ROUTES = [
  '/',
  '/signin',
  '/setup',
  '/reset',
  '/dashboard',
  '/dashboard/settings',
  '/api/export-interviews/batch',
  '/api/storage/presign',
  '/api/generate-test-interviews',
  '/api/v1/interview',
];

describe('isPublicParticipantPath', () => {
  it.each(PUBLIC_SERVER_ACTION_ROUTES)('treats %s as public', (path) => {
    expect(isPublicParticipantPath(path)).toBe(true);
  });

  it.each(RESEARCHER_ROUTES)('treats %s as researcher-only', (path) => {
    expect(isPublicParticipantPath(path)).toBe(false);
  });
});

describe('Server Action requests to public participant routes', () => {
  it.each(PUBLIC_SERVER_ACTION_ROUTES)(
    'refuses a request to %s',
    async (path) => {
      const response = await proxy(nextActionRequest(path));

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ error: expect.any(String) });
      expect((body as { error: string }).error.length).toBeGreaterThan(0);
    },
  );
});

describe('Server Action requests to researcher routes', () => {
  it.each(RESEARCHER_ROUTES)('lets a request to %s through', async (path) => {
    const response = await proxy(nextActionRequest(path));

    // NextResponse.next() marks the response this way; a 403 never does.
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.status).not.toBe(403);
  });
});

describe('requests without a Next-Action header', () => {
  it.each([...PUBLIC_SERVER_ACTION_ROUTES, ...RESEARCHER_ROUTES])(
    'always passes %s through',
    async (path) => {
      const response = await proxy(
        new NextRequest(`http://localhost${path}`, {
          headers: { Cookie: SESSION_COOKIE },
        }),
      );

      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );
});
