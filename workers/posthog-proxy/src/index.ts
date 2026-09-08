const API_HOST = 'us.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

function corsHeaders(request: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function addCorsHeaders(response: Response, request: Request): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

async function handleRequest(request: Request, ctx: ExecutionContext) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;
  const pathWithParams = pathname + search;

  let response: Response;
  if (pathname.startsWith('/static/')) {
    response = await retrieveStatic(request, pathWithParams, ctx);
  } else {
    response = await forwardRequest(request, pathWithParams);
  }

  return addCorsHeaders(response, request);
}

async function retrieveStatic(
  request: Request,
  pathname: string,
  ctx: ExecutionContext,
) {
  let response = await caches.default.match(request);
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathname}`);
    ctx.waitUntil(caches.default.put(request, response.clone()));
  }
  return response;
}

async function forwardRequest(request: Request, pathWithSearch: string) {
  // Analytics are described as anonymous, so the participant's or
  // researcher's network address must not reach PostHog with them.
  // Cloudflare sets these on the incoming request (CF-Connecting-IPv6 in
  // place of CF-Connecting-IP when Pseudo-IPv4 overwrite mode hides an IPv6
  // client's real address there); a client cannot forge them, but we must
  // not turn around and forward any of them upstream.
  const originHeaders = new Headers(request.headers);
  originHeaders.delete('cookie');
  for (const header of [
    'x-forwarded-for',
    'cf-connecting-ip',
    'cf-connecting-ipv6',
    'true-client-ip',
    'x-real-ip',
  ]) {
    originHeaders.delete(header);
  }

  const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers: originHeaders,
    body:
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : null,
    redirect: request.redirect,
  });

  return await fetch(originRequest);
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext) {
    return handleRequest(request, ctx);
  },
};
