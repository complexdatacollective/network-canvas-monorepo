import { getLocalizedPathname } from '~/lib/i18n/clientLocale';
import type { Locale } from '~/lib/i18n/locales';
import {
  protocolGalleryOrigin,
  protocolGalleryPathPrefix,
} from '~/lib/protocolGalleryHosting';

const canonicalDocumentationUrl = 'https://documentation.networkcanvas.com';
const canonicalNetworkCanvasUrl = 'https://networkcanvas.com';

/**
 * Which host is serving the page whose links are being resolved. The gallery
 * shares this app and this Netlify deploy, so a link that stays inside the site
 * on one host leaves it on the other.
 */
export type SiteHost = 'website' | 'protocolGallery';

function parseOrigin(configuredUrl: string, variableName: string) {
  const url = new URL(configuredUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${variableName} must be an origin without credentials, a path, a query, or a fragment.`,
    );
  }

  return url;
}

function getDocumentationRoot() {
  return parseOrigin(
    process.env.NEXT_PUBLIC_DOCUMENTATION_URL || canonicalDocumentationUrl,
    'NEXT_PUBLIC_DOCUMENTATION_URL',
  );
}

/**
 * The subdomain exists only where the deployment declares it. Local
 * development and deploy previews serve a single host, so there the gallery
 * stays a route of this site and every gallery URL keeps its `/protocol-gallery`
 * prefix.
 */
function getProtocolGalleryRoot() {
  const configuredUrl = process.env.NEXT_PUBLIC_PROTOCOL_GALLERY_URL;
  if (!configuredUrl) return undefined;

  return parseOrigin(configuredUrl, 'NEXT_PUBLIC_PROTOCOL_GALLERY_URL');
}

function isProtocolGalleryHosted() {
  return getProtocolGalleryRoot() !== undefined;
}

export function documentationUrl(path = '/') {
  return new URL(path, getDocumentationRoot()).toString();
}

/**
 * Same-origin path to a gallery page, for use by the gallery's own pages.
 */
export function protocolGalleryHref(locale: string, slug?: string) {
  const prefix = isProtocolGalleryHosted() ? '' : protocolGalleryPathPrefix;
  const detail = slug ? `/${slug}` : '';

  return `/${locale}${prefix}${detail}/`;
}

/**
 * Absolute URL of a gallery page, for canonicals and alternates.
 */
export function protocolGalleryUrl(locale: string, slug?: string) {
  const root = getProtocolGalleryRoot();
  const detail = slug ? `/${slug}` : '';

  return root
    ? `${root.origin}/${locale}${detail}/`
    : `${canonicalNetworkCanvasUrl}/${locale}${protocolGalleryPathPrefix}${detail}/`;
}

/**
 * The locale cookie is host-scoped, so a link that crosses hosts has to carry
 * the visitor's locale itself or the other host renegotiates it from the
 * browser language.
 */
function crossHostUrl(url: URL, locale: Locale) {
  url.pathname = getLocalizedPathname(locale, url.pathname);
  return url.toString();
}

/**
 * Adapt the shared navigation to the active deployment without changing the
 * production URLs owned by the environment-agnostic Fresco component.
 */
export function resolveWebsiteNavigationUrl(
  href: string,
  locale: Locale,
  host: SiteHost = 'website',
) {
  // The shared navigation emits the website's own routes as site-relative
  // paths, which point at the gallery once it has its own origin.
  const crossHost = host === 'protocolGallery' && isProtocolGalleryHosted();

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    if (!crossHost) return href;

    try {
      return crossHostUrl(new URL(href, canonicalNetworkCanvasUrl), locale);
    } catch {
      return href;
    }
  }

  if (url.origin === canonicalDocumentationUrl) {
    const root = getDocumentationRoot();
    url.protocol = root.protocol;
    url.host = root.host;
    return url.toString();
  }

  if (url.origin === protocolGalleryOrigin) {
    // Without the subdomain the gallery is a route of this site.
    return isProtocolGalleryHosted()
      ? crossHostUrl(url, locale)
      : protocolGalleryPathPrefix;
  }

  if (url.origin === canonicalNetworkCanvasUrl) {
    if (crossHost) return crossHostUrl(url, locale);

    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === '/' ? '/' : path;
  }

  return href;
}
