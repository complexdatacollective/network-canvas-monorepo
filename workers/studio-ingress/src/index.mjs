const PUBLIC_ORIGINS = new Set([
  'https://networkcanvas.studio',
  'https://studio.networkcanvas.dev',
]);
const DEFAULT_ORIGIN_TIMEOUT_MS = 10_000;
const MAX_ORIGIN_TIMEOUT_MS = 30_000;
const STATIC_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
]);
const BACKEND_PREFIXES = [
  '/api',
  '/healthz',
  '/metrics',
  '/readyz',
  '/rpc',
  '/storage',
  '/ws',
];
const FORWARDED_REQUEST_HEADERS = [
  'forwarded',
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
];
const CORS_RESPONSE_HEADERS = [
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
];
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

function problem(status, title) {
  return new Response(JSON.stringify({ title, status }), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/problem+json',
    },
  });
}

function positiveInteger(value, fallback) {
  const resolved = value === undefined ? fallback : value;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0 ||
    resolved > MAX_ORIGIN_TIMEOUT_MS
  )
    throw new Error('invalid origin timeout');
  return resolved;
}

function exactOrigin(value, provider) {
  if (typeof value !== 'string' || value.length > 512)
    throw new Error('invalid ingress origin');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin !== value
  )
    throw new Error('invalid ingress origin');
  if (
    provider === 'netlify' &&
    !/^[a-z0-9-]+\.netlify\.app$/.test(url.hostname)
  )
    throw new Error('invalid static origin');
  if (provider === 'fly' && !/^[a-z0-9-]+\.fly\.dev$/.test(url.hostname))
    throw new Error('invalid backend origin');
  return url.origin;
}

function resolvePolicy(configuration) {
  const publicOrigin = exactOrigin(configuration.publicOrigin);
  if (!PUBLIC_ORIGINS.has(publicOrigin))
    throw new Error('public origin is not approved');
  const staticOrigin = exactOrigin(configuration.staticOrigin, 'netlify');
  const backendOrigin = exactOrigin(configuration.backendOrigin, 'fly');
  if (new Set([publicOrigin, staticOrigin, backendOrigin]).size !== 3)
    throw new Error('ingress origins must be distinct');
  if (
    staticOrigin.includes('replace-with-') ||
    backendOrigin.includes('replace-with-')
  )
    throw new Error('placeholder ingress origin');
  return {
    publicOrigin,
    staticOrigin,
    backendOrigin,
    originTimeoutMs: positiveInteger(
      configuration.originTimeoutMs,
      DEFAULT_ORIGIN_TIMEOUT_MS,
    ),
  };
}

function isBackendPath(pathname) {
  return BACKEND_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPath(pathname) {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

function canonicalPath(url) {
  if (ENCODED_PATH_SEPARATOR.test(url.pathname))
    throw new Error('encoded path separator');
  return url.pathname.replace(/\/{2,}/g, '/');
}

function staticHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (STATIC_REQUEST_HEADERS.has(name.toLowerCase()))
      headers.append(name, value);
  }
  return headers;
}

function backendHeaders(request, publicOrigin) {
  const headers = new Headers(request.headers);
  for (const name of FORWARDED_REQUEST_HEADERS) headers.delete(name);
  headers.set('x-forwarded-host', new URL(publicOrigin).host);
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-request-id', crypto.randomUUID());
  return headers;
}

function requestBody(request) {
  return request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : request.body;
}

function cancelResponse(response) {
  try {
    const cancelled = response?.body?.cancel?.();
    Promise.resolve(cancelled).catch(() => {});
  } catch {}
  try {
    response?.webSocket?.close?.(1011, 'Ingress request ended');
  } catch {}
}

function removeCorsHeaders(headers) {
  for (const name of CORS_RESPONSE_HEADERS) headers.delete(name);
}

async function boundedFetch(fetchImpl, request, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('origin timeout'));
    }, timeoutMs);
  });
  const originRequest = new Request(request, {
    signal: AbortSignal.any([request.signal, controller.signal]),
  });
  const pending = Promise.resolve().then(() => fetchImpl(originRequest));
  try {
    const response = await Promise.race([pending, timeout]);
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    if (timedOut) pending.then(cancelResponse, () => {});
    throw error;
  }
}

function rewriteLocation(
  response,
  upstreamOrigin,
  publicOrigin,
  allowExternal,
) {
  const location = response.headers?.get?.('location');
  if (!location) return { response, failed: false };
  let resolved;
  try {
    resolved = new URL(location, upstreamOrigin);
  } catch {
    cancelResponse(response);
    return {
      response: problem(502, 'Origin returned an invalid redirect'),
      failed: true,
    };
  }
  const upstreamUrl = new URL(upstreamOrigin);
  const publicUrl = new URL(publicOrigin);
  if (
    resolved.username ||
    resolved.password ||
    resolved.port ||
    (resolved.protocol !== 'https:' && resolved.protocol !== 'http:')
  ) {
    cancelResponse(response);
    return {
      response: problem(502, 'Origin returned an unsafe redirect'),
      failed: true,
    };
  }
  if (
    resolved.hostname === upstreamUrl.hostname ||
    resolved.hostname === publicUrl.hostname
  ) {
    resolved.protocol = publicUrl.protocol;
    resolved.host = publicUrl.host;
  } else if (!allowExternal || resolved.protocol !== 'https:') {
    cancelResponse(response);
    return {
      response: problem(502, 'Origin returned a foreign redirect'),
      failed: true,
    };
  }
  const headers = new Headers(response.headers);
  headers.set('location', resolved.href);
  return {
    response: new Response(response.body, {
      status: response.status,
      headers,
    }),
    failed: false,
  };
}

function backendResponse(response, policy, pathname, expectWebSocket) {
  if (expectWebSocket) {
    if (response?.status === 101 && response?.webSocket) return response;
    cancelResponse(response);
    return problem(502, 'Backend refused the WebSocket upgrade');
  }
  if (response?.status === 101 || response?.webSocket) {
    cancelResponse(response);
    return problem(502, 'Backend returned an unexpected WebSocket upgrade');
  }
  if (!(response instanceof Response)) {
    cancelResponse(response);
    return problem(502, 'Backend origin response was invalid');
  }
  const redirected = rewriteLocation(
    response,
    policy.backendOrigin,
    policy.publicOrigin,
    isAuthPath(pathname),
  );
  if (redirected.failed) return redirected.response;
  const headers = new Headers(redirected.response.headers);
  removeCorsHeaders(headers);
  headers.set('cache-control', 'no-store');
  headers.set('cloudflare-cdn-cache-control', 'no-store');
  headers.set('cdn-cache-control', 'no-store');
  return new Response(redirected.response.body, {
    status: redirected.response.status,
    headers,
  });
}

function staticResponse(response, policy) {
  if (!(response instanceof Response)) {
    cancelResponse(response);
    return problem(502, 'Static origin response was invalid');
  }
  const redirected = rewriteLocation(
    response,
    policy.staticOrigin,
    policy.publicOrigin,
    false,
  );
  if (redirected.failed) return redirected.response;
  const headers = new Headers(redirected.response.headers);
  headers.delete('set-cookie');
  removeCorsHeaders(headers);
  return new Response(redirected.response.body, {
    status: redirected.response.status,
    headers,
  });
}

/**
 * Create the managed Studio routing-only ingress. Product handlers, state,
 * authentication decisions, and WebSocket messages remain on the Fly origin.
 */
export function createManagedStudioIngress(configuration) {
  let policy;
  try {
    policy = resolvePolicy(configuration);
  } catch {
    return { fetch: async () => problem(503, 'Ingress is not configured') };
  }
  const fetchImpl = configuration.fetchImpl ?? fetch;
  if (typeof fetchImpl !== 'function')
    return { fetch: async () => problem(503, 'Ingress is not configured') };

  return {
    async fetch(request) {
      if (!(request instanceof Request)) return problem(400, 'Invalid request');
      const incoming = new URL(request.url);
      if (
        incoming.hostname === new URL(policy.publicOrigin).hostname &&
        incoming.protocol === 'http:'
      ) {
        let redirectPath;
        try {
          redirectPath = canonicalPath(incoming);
        } catch {
          return problem(400, 'Ambiguous request path');
        }
        const redirect = new URL(policy.publicOrigin);
        redirect.pathname = redirectPath;
        redirect.search = incoming.search;
        return Response.redirect(redirect, 308);
      }
      if (incoming.origin !== policy.publicOrigin)
        return problem(421, 'Request host is not configured');

      let pathname;
      try {
        pathname = canonicalPath(incoming);
      } catch {
        return problem(400, 'Ambiguous request path');
      }
      incoming.pathname = pathname;
      const backend = isBackendPath(pathname);
      const upgrade = request.headers.get('upgrade');
      if (
        upgrade &&
        (pathname !== '/ws' || upgrade.toLowerCase() !== 'websocket')
      )
        return problem(400, 'WebSocket upgrade path is invalid');
      if (pathname === '/ws' && upgrade?.toLowerCase() !== 'websocket')
        return problem(426, 'WebSocket upgrade required');
      if (
        pathname === '/ws' &&
        request.headers.get('origin') !== policy.publicOrigin
      )
        return problem(403, 'WebSocket origin is not allowed');
      if (!backend && request.method !== 'GET' && request.method !== 'HEAD')
        return new Response(null, {
          status: 405,
          headers: { 'allow': 'GET, HEAD', 'cache-control': 'no-store' },
        });

      const upstreamOrigin = backend
        ? policy.backendOrigin
        : policy.staticOrigin;
      const upstream = new URL(upstreamOrigin);
      upstream.pathname = incoming.pathname;
      // Netlify only supplies immutable build output and the SPA shell. Client
      // route queries remain in the browser URL, while only server surfaces
      // receive authentication, invitation, and callback query data.
      if (backend) upstream.search = incoming.search;
      const headers = backend
        ? backendHeaders(request, policy.publicOrigin)
        : staticHeaders(request);
      const body = requestBody(request);
      const originRequest = new Request(upstream, {
        method: request.method,
        headers,
        body,
        ...(body === undefined ? {} : { duplex: 'half' }),
        redirect: 'manual',
        ...(backend ? { cache: 'no-store' } : {}),
      });

      try {
        const response = await boundedFetch(
          fetchImpl,
          originRequest,
          policy.originTimeoutMs,
        );
        return backend
          ? backendResponse(response, policy, pathname, pathname === '/ws')
          : staticResponse(response, policy);
      } catch {
        return problem(504, 'Origin request failed or timed out');
      }
    },
  };
}

export default {
  fetch(request, env) {
    return createManagedStudioIngress({
      publicOrigin: env?.PUBLIC_ORIGIN,
      staticOrigin: env?.STATIC_ORIGIN,
      backendOrigin: env?.BACKEND_ORIGIN,
    }).fetch(request);
  },
};
