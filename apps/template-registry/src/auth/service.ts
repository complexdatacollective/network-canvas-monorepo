import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { REGISTRY_AUTH_TABLES } from './schema.ts';

export type RegistrySession = {
  userId: string;
  email: string;
  /** Publisher claims and registry token issuance must require this to be true. */
  emailVerified: boolean;
};

export type RegistryAuthDiagnostic =
  | 'REGISTRY_AUTH_DIAGNOSTIC'
  | 'REGISTRY_AUTH_REQUEST_FAILURE'
  | 'REGISTRY_AUTH_SESSION_FAILURE';

export type RegistryAuth = {
  handler: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<RegistrySession | null>;
};

export type RegistryAuthOptions = {
  pool: Pool;
  baseUrl: string;
  secret: string;
  sendMagicLink: (input: { email: string; url: string }) => Promise<void>;
  onDiagnostic: (code: RegistryAuthDiagnostic) => void;
};

const AUTH_METHODS = new Map([
  ['/api/auth/sign-in/magic-link', 'POST'],
  ['/api/auth/magic-link/verify', 'GET'],
  ['/api/auth/get-session', 'GET'],
  ['/api/auth/sign-out', 'POST'],
]);

function authResponse(code: string, status: number): Response {
  return Response.json(
    { code },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

function authOrigin(baseUrl: string, secret: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('REGISTRY_AUTH_INVALID_CONFIGURATION');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    secret.length < 32
  ) {
    throw new Error('REGISTRY_AUTH_INVALID_CONFIGURATION');
  }
  return url.origin;
}

export function createRegistryAuth({
  pool,
  baseUrl,
  secret,
  sendMagicLink,
  onDiagnostic,
}: RegistryAuthOptions): RegistryAuth {
  const origin = authOrigin(baseUrl, secret);
  const auth = betterAuth({
    baseURL: origin,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(drizzle({ client: pool }), {
      provider: 'pg',
      schema: REGISTRY_AUTH_TABLES,
      transaction: true,
    }),
    trustedOrigins: [origin],
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      // There is no verified peer address at this Request boundary. A forged
      // forwarding header must not mint a fresh sign-in rate-limit bucket.
      ipAddress: { ipAddressHeaders: [] },
      trustedProxyHeaders: false,
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: 'registry',
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: false },
    },
    session: { cookieCache: { enabled: false } },
    emailAndPassword: { enabled: false },
    socialProviders: {},
    account: { accountLinking: { enabled: false } },
    // Framework messages can include submitted addresses, callbacks, tokens,
    // or database errors. Discard logger inputs and route exceptions to our
    // boundary: better-call otherwise logs raw failures after onError returns.
    logger: { log: () => onDiagnostic('REGISTRY_AUTH_DIAGNOSTIC') },
    onAPIError: { throw: true },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => sendMagicLink({ email, url }),
      }),
    ],
  });

  return {
    handler: async (request) => {
      const path = new URL(request.url).pathname;
      if (AUTH_METHODS.get(path) !== request.method) {
        return authResponse('REGISTRY_AUTH_NOT_FOUND', 404);
      }
      const requestOrigin = request.headers.get('origin');
      if (
        (requestOrigin !== null && requestOrigin !== origin) ||
        (request.method === 'POST' && requestOrigin !== origin)
      ) {
        return authResponse('REGISTRY_AUTH_FORBIDDEN', 403);
      }
      let response: Response;
      try {
        response = await auth.handler(request);
      } catch {
        response = authResponse('REGISTRY_AUTH_UNAVAILABLE', 503);
      }
      // Better Auth can turn an exception into a response before it reaches
      // this catch. Do not expose its arbitrary exception body to the caller.
      if (response.status >= 500) {
        onDiagnostic('REGISTRY_AUTH_REQUEST_FAILURE');
        response = authResponse('REGISTRY_AUTH_UNAVAILABLE', 503);
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('X-Retry-After');
        if (retryAfter) response.headers.set('Retry-After', retryAfter);
      }
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    },
    getSession: async (headers) => {
      const requestOrigin = headers.get('origin');
      if (requestOrigin !== null && requestOrigin !== origin) return null;
      try {
        const result = await auth.api.getSession({ headers });
        if (!result) return null;
        return {
          userId: result.user.id,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
        };
      } catch {
        onDiagnostic('REGISTRY_AUTH_SESSION_FAILURE');
        throw new Error('REGISTRY_AUTH_SESSION_UNAVAILABLE');
      }
    },
  };
}
