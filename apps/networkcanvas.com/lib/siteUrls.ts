const canonicalDocumentationUrl = 'https://documentation.networkcanvas.com';
const canonicalNetworkCanvasUrl = 'https://networkcanvas.com';
const canonicalProtocolGalleryUrl = 'https://protocolgallery.networkcanvas.com';
const protocolGalleryPath = '/protocol-gallery';

function getDocumentationRoot() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_DOCUMENTATION_URL || canonicalDocumentationUrl;
  const url = new URL(configuredUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('NEXT_PUBLIC_DOCUMENTATION_URL must use HTTP or HTTPS.');
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'NEXT_PUBLIC_DOCUMENTATION_URL must be an origin without credentials, a path, a query, or a fragment.',
    );
  }

  return url;
}

export function documentationUrl(path = '/') {
  return new URL(path, getDocumentationRoot()).toString();
}

/**
 * Adapt the shared navigation to the active deployment without changing the
 * production URLs owned by the environment-agnostic Fresco component.
 */
export function resolveWebsiteNavigationUrl(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  if (url.origin === canonicalDocumentationUrl) {
    const root = getDocumentationRoot();
    url.protocol = root.protocol;
    url.host = root.host;
    return url.toString();
  }

  // The gallery now lives on this site, so the shared navigation's external
  // destination resolves to the local route.
  if (url.origin === canonicalProtocolGalleryUrl) {
    return protocolGalleryPath;
  }

  if (url.origin === canonicalNetworkCanvasUrl) {
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === '/' ? '/' : path;
  }

  return href;
}
