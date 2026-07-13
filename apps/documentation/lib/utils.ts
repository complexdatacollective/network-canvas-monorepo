// The canonical host for the documentation site. A link is "external" when it
// points anywhere other than here, so we can open it in a new tab.
const DOCS_HOST = 'documentation.networkcanvas.com';

// True when following the href would take the reader off the documentation
// site. Internal navigation uses relative paths/anchors (never a scheme), and
// absolute links back to the docs host stay in the same tab.
function isExternalUrl(href: string): boolean {
  if (!href) {
    return false;
  }
  // Non-http schemes (mail clients, dialers) always leave the site.
  if (/^(mailto:|tel:)/i.test(href)) {
    return true;
  }
  // Only absolute (scheme or protocol-relative) URLs can be external.
  if (!/^(https?:)?\/\//i.test(href)) {
    return false;
  }
  try {
    return new URL(href, `https://${DOCS_HOST}`).host !== DOCS_HOST;
  } catch {
    return false;
  }
}

// Anchor props that open external links in a new tab without leaking the
// opener; spread onto a link only when the destination is external.
export function externalLinkProps(href: string) {
  return isExternalUrl(href)
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}
