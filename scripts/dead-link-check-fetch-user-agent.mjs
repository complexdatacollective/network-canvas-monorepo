// The dead-link checker uses Node's default `User-Agent: node`, which some
// application gateways reject even though the same public URL works in a
// browser. The checker has no request-header option, so its workflow steps
// preload this narrowly scoped fetch wrapper through NODE_OPTIONS.
const LINK_CHECK_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NetworkCanvasLinkChecker/1.0';

const nativeFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (!headers.has('user-agent')) {
    headers.set('user-agent', LINK_CHECK_USER_AGENT);
  }

  return nativeFetch(input, { ...init, headers });
};
