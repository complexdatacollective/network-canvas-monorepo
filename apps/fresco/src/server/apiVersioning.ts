import '@tanstack/react-start/server-only';

type Handler = (request: Request) => Response | Promise<Response>;

/**
 * `app/api/_helpers/versioning.ts` over standard `Request`/`Response`.
 *
 * The Next helper takes `{ params }` as a second argument because App Router
 * hands dynamic segments to the handler that way; Start hands them over as
 * `params` on the handler context, so the version is passed in directly. The
 * 404 and 405 bodies are byte-identical.
 */
export function createVersionedHandler(
  handlers: Record<string, Record<string, Handler>>,
  method: string,
) {
  return (request: Request, version: string) => {
    const versionHandlers = handlers[version];
    if (!versionHandlers) {
      return Response.json(
        { error: `Unsupported API version: ${version}` },
        { status: 404 },
      );
    }

    const handler = versionHandlers[method];
    if (!handler) {
      return Response.json(
        { error: `${method} not supported in ${version}` },
        { status: 405 },
      );
    }

    return handler(request);
  };
}

export function createCorsHeaders(methods: string) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
