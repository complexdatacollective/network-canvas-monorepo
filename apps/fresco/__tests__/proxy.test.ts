import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import {
  isPossibleServerActionRequest,
  isPublicParticipantPath,
  proxy,
} from '~/proxy';

/**
 * A signed-in researcher's session cookie. Proxy never reads it — closing
 * this gap only depends on the path and request shape, not on whether the
 * session is real — but every case below carries one to prove the block (and
 * the pass-through) hold regardless of an attacker also having a valid
 * session.
 */
const SESSION_COOKIE = 'auth_session=abc123';

const ACTION_ID = '60f0c9b1234567890abcdef1234567890abcdef';

/**
 * The two ways Next dispatches a Server Action (server-action-request-meta.ts):
 * a `Next-Action` header for React's fetch-based client, or a
 * `multipart/form-data` body naming the action in a `$ACTION_ID_<id>` field
 * for a plain HTML `<form action={serverAction}>` submitted without
 * JavaScript. Both must be refused identically, so every path/route case
 * below runs against both shapes.
 */
const SERVER_ACTION_REQUEST_SHAPES: Record<
  string,
  (path: string) => NextRequest
> = {
  'a Next-Action header': (path) =>
    new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Next-Action': ACTION_ID, 'Cookie': SESSION_COOKIE },
    }),
  'a multipart form submission': (path) =>
    new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----t',
        'Cookie': SESSION_COOKIE,
      },
      body: `------t\r\nContent-Disposition: form-data; name="$ACTION_ID_${ACTION_ID}"\r\n\r\n\r\n------t--`,
    }),
};

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
 * `/expired` binds a real (dev-only) Server Action on its reset control, so
 * it belongs here rather than in the public list even though the FAQ's
 * network restriction must separately cover it.
 */
const RESEARCHER_ROUTES = [
  '/',
  '/signin',
  '/setup',
  '/reset',
  '/expired',
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

describe('isPossibleServerActionRequest', () => {
  for (const [label, build] of Object.entries(SERVER_ACTION_REQUEST_SHAPES)) {
    it(`recognizes ${label}`, () => {
      expect(isPossibleServerActionRequest(build('/dashboard/settings'))).toBe(
        true,
      );
    });
  }

  it('recognizes a POST with an x-www-form-urlencoded body', () => {
    const request = new NextRequest('http://localhost/dashboard/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `$ACTION_ID_${ACTION_ID}=`,
    });
    expect(isPossibleServerActionRequest(request)).toBe(true);
  });

  it('ignores a GET carrying a Next-Action header (Next never dispatches on GET)', () => {
    const request = new NextRequest('http://localhost/dashboard/settings', {
      method: 'GET',
      headers: { 'Next-Action': ACTION_ID },
    });
    expect(isPossibleServerActionRequest(request)).toBe(false);
  });

  it('ignores an ordinary JSON POST', () => {
    const request = new NextRequest('http://localhost/interview/abc/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(isPossibleServerActionRequest(request)).toBe(false);
  });
});

describe('Server Action requests to public participant routes', () => {
  for (const [label, build] of Object.entries(SERVER_ACTION_REQUEST_SHAPES)) {
    describe(label, () => {
      it.each(PUBLIC_SERVER_ACTION_ROUTES)(
        'refuses a request to %s',
        async (path) => {
          const response = await proxy(build(path));

          expect(response.status).toBe(403);
          const body: unknown = await response.json();
          expect(body).toMatchObject({ error: expect.any(String) });
          expect((body as { error: string }).error.length).toBeGreaterThan(0);
        },
      );
    });
  }
});

describe('Server Action requests to researcher routes', () => {
  for (const [label, build] of Object.entries(SERVER_ACTION_REQUEST_SHAPES)) {
    describe(label, () => {
      it.each(RESEARCHER_ROUTES)(
        'lets a request to %s through',
        async (path) => {
          const response = await proxy(build(path));

          // NextResponse.next() marks the response this way; a 403 never does.
          expect(response.headers.get('x-middleware-next')).toBe('1');
          expect(response.status).not.toBe(403);
        },
      );
    });
  }
});

describe('requests that are not a possible Server Action', () => {
  it.each([...PUBLIC_SERVER_ACTION_ROUTES, ...RESEARCHER_ROUTES])(
    'always passes a plain GET to %s through',
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
