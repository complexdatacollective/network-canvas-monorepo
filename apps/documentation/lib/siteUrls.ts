const canonicalNetworkCanvasUrl = 'https://networkcanvas.com';

function getNetworkCanvasRoot() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_NETWORK_CANVAS_URL || canonicalNetworkCanvasUrl;
  const url = new URL(configuredUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('NEXT_PUBLIC_NETWORK_CANVAS_URL must use HTTP or HTTPS.');
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'NEXT_PUBLIC_NETWORK_CANVAS_URL must be an origin without credentials, a path, a query, or a fragment.',
    );
  }

  return url;
}

/**
 * Point canonical networkcanvas.com links at the active peer deployment.
 * Other Network Canvas subdomains and third-party links are left untouched.
 */
export function resolveNetworkCanvasUrl(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  if (url.origin !== canonicalNetworkCanvasUrl) return href;

  // /download is a production-only legacy redirect. Use the real route so the
  // destination also works against the website's local Next development server.
  if (['/download', '/download/', '/download.html'].includes(url.pathname)) {
    url.pathname = '/get-started';
  }

  const root = getNetworkCanvasRoot();
  url.protocol = root.protocol;
  url.host = root.host;

  return url.toString();
}
