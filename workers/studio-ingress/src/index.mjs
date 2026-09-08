const PUBLIC_ORIGINS = new Set([
  'https://networkcanvas.studio',
  'https://studio.networkcanvas.dev',
]);
const DEFAULT_ORIGIN_TIMEOUT_MS = 10_000;
const MAX_ORIGIN_TIMEOUT_MS = 30_000;
// A 100 MiB upload takes about 14 minutes at 1 Mbit/s before the backend can
// finish its object-store write. Keep that supported path bounded without
// applying the ordinary response-header deadline to it.
const DEFAULT_UPLOAD_ORIGIN_TIMEOUT_MS = 15 * 60_000;
const MAX_UPLOAD_ORIGIN_TIMEOUT_MS = 30 * 60_000;
const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const IMMUTABLE_ASSET_PATH = /^\/storage\/([0-9a-f]{64})$/;
const INGRESS_PROOF_HEADER = 'x-studio-managed-ingress-proof';
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
  INGRESS_PROOF_HEADER,
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

function positiveInteger(value, fallback, maximum = MAX_ORIGIN_TIMEOUT_MS) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum)
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
  if (
    typeof configuration.backendIngressSecret !== 'string' ||
    configuration.backendIngressSecret.length < 32 ||
    configuration.backendIngressSecret.length > 256 ||
    !/^[!-~]+$/.test(configuration.backendIngressSecret)
  )
    throw new Error('invalid backend ingress secret');
  return {
    publicOrigin,
    staticOrigin,
    backendOrigin,
    backendIngressSecret: configuration.backendIngressSecret,
    originTimeoutMs: positiveInteger(
      configuration.originTimeoutMs,
      DEFAULT_ORIGIN_TIMEOUT_MS,
    ),
    uploadOriginTimeoutMs: positiveInteger(
      configuration.uploadOriginTimeoutMs,
      DEFAULT_UPLOAD_ORIGIN_TIMEOUT_MS,
      MAX_UPLOAD_ORIGIN_TIMEOUT_MS,
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

function isAssetUpload(method, pathname) {
  return (
    method === 'POST' && (pathname === '/storage' || pathname === '/storage/')
  );
}

function isImmutableAssetResponse(response, method, pathname) {
  if ((method !== 'GET' && method !== 'HEAD') || response.status !== 200)
    return false;
  const match = IMMUTABLE_ASSET_PATH.exec(pathname);
  if (!match) return false;
  return (
    response.headers.get('cache-control') === IMMUTABLE_ASSET_CACHE_CONTROL &&
    response.headers.get('etag') === `"${match[1]}"` &&
    !response.headers.has('set-cookie')
  );
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

function canonicalClientIp(headers) {
  const candidate = headers.get('cf-connecting-ip');
  if (
    !candidate ||
    candidate.length > 45 ||
    candidate.includes('%') ||
    candidate.includes(',') ||
    [...candidate].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || code === 127;
    })
  )
    return undefined;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(candidate)) {
    if (candidate.split('.').every((part) => Number(part) <= 255))
      return candidate;
    return undefined;
  }
  if (!candidate.includes(':')) return undefined;
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return undefined;
  }
}

function backendHeaders(request, policy, clientIp) {
  const headers = new Headers(request.headers);
  for (const name of FORWARDED_REQUEST_HEADERS) headers.delete(name);
  headers.delete('cf-connecting-ip');
  headers.delete('cf-connecting-ipv6');
  headers.delete('x-real-ip');
  headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-host', new URL(policy.publicOrigin).host);
  headers.set('x-forwarded-proto', 'https');
  headers.set(INGRESS_PROOF_HEADER, policy.backendIngressSecret);
  headers.set('x-request-id', crypto.randomUUID());
  return headers;
}

function assetCacheKey(policy, pathname, requestHeaders) {
  const headers = new Headers();
  for (const name of ['if-modified-since', 'if-none-match', 'range']) {
    const value = requestHeaders?.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(`${policy.publicOrigin}${pathname}`, {
    method: 'GET',
    headers,
  });
}

function isSafeCachedAssetResponse(response, request, pathname) {
  if (!(response instanceof Response)) return false;
  const range = request.headers.has('range');
  const conditional =
    request.headers.has('if-none-match') ||
    request.headers.has('if-modified-since');
  if (
    response.status !== 200 &&
    !(response.status === 206 && range) &&
    !(response.status === 304 && conditional)
  )
    return false;
  const match = IMMUTABLE_ASSET_PATH.exec(pathname);
  return Boolean(
    match &&
    response.headers.get('cache-control') === IMMUTABLE_ASSET_CACHE_CONTROL &&
    response.headers.get('etag') === `"${match[1]}"` &&
    !response.headers.has('set-cookie'),
  );
}

async function boundedCacheMatch(cache, request, timeoutMs) {
  let timer;
  const pending = Promise.resolve().then(() => cache.match(request));
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('cache timeout')), timeoutMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } catch (error) {
    pending.then(cancelResponse, () => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function backendResponse(response, policy, method, pathname, expectWebSocket) {
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
  if (isImmutableAssetResponse(redirected.response, method, pathname)) {
    headers.set('cache-control', IMMUTABLE_ASSET_CACHE_CONTROL);
    headers.set('cloudflare-cdn-cache-control', IMMUTABLE_ASSET_CACHE_CONTROL);
    headers.set('cdn-cache-control', IMMUTABLE_ASSET_CACHE_CONTROL);
  } else {
    headers.set('cache-control', 'no-store');
    headers.set('cloudflare-cdn-cache-control', 'no-store');
    headers.set('cdn-cache-control', 'no-store');
  }
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
      const clientIp = backend ? canonicalClientIp(request.headers) : undefined;
      if (backend && !clientIp)
        return problem(400, 'Edge client address is invalid');
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

      const cache = configuration.cache;
      if (
        backend &&
        request.method === 'GET' &&
        IMMUTABLE_ASSET_PATH.test(pathname) &&
        !request.headers.has('if-range') &&
        cache?.match
      ) {
        try {
          const cached = await boundedCacheMatch(
            cache,
            assetCacheKey(policy, pathname, request.headers),
            policy.originTimeoutMs,
          );
          if (cached && isSafeCachedAssetResponse(cached, request, pathname))
            return cached;
          if (cached) cancelResponse(cached);
        } catch {}
      }

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
        ? backendHeaders(request, policy, clientIp)
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
          isAssetUpload(request.method, pathname)
            ? policy.uploadOriginTimeoutMs
            : policy.originTimeoutMs,
        );
        const routed = backend
          ? backendResponse(
              response,
              policy,
              request.method,
              pathname,
              pathname === '/ws',
            )
          : staticResponse(response, policy);
        if (
          backend &&
          request.method === 'GET' &&
          isImmutableAssetResponse(routed, 'GET', pathname) &&
          cache?.put &&
          typeof configuration.waitUntil === 'function'
        ) {
          const cacheWrite = Promise.resolve()
            .then(() =>
              cache.put(assetCacheKey(policy, pathname), routed.clone()),
            )
            .catch(() => {});
          try {
            configuration.waitUntil(cacheWrite);
          } catch {}
        }
        return routed;
      } catch {
        return problem(504, 'Origin request failed or timed out');
      }
    },
  };
}

export default {
  fetch(request, env, context) {
    return createManagedStudioIngress({
      publicOrigin: env?.PUBLIC_ORIGIN,
      staticOrigin: env?.STATIC_ORIGIN,
      backendOrigin: env?.BACKEND_ORIGIN,
      backendIngressSecret: env?.STUDIO_MANAGED_INGRESS_SECRET,
      cache: globalThis.caches?.default,
      waitUntil:
        typeof context?.waitUntil === 'function'
          ? context.waitUntil.bind(context)
          : undefined,
    }).fetch(request);
  },
};
