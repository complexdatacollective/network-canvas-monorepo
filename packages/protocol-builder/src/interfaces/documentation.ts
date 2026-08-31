/**
 * The documentation site every Network Canvas host points a researcher at.
 *
 * It lives here because protocol authoring is what the documentation is about:
 * the sections in this package link into it, and a host adds its own
 * app-specific pages on the same base rather than restating it.
 */
export const DOCS_BASE_URL = 'https://documentation.networkcanvas.com/en';

/** Where an interface is documented. */
export const interfaceDocumentationUrl = (slug: string): string =>
  `${DOCS_BASE_URL}/design-protocols/interface-documentation/${slug}/`;

/** Key concepts a stage editor's own sections link to. */
export const protocolAuthoringLinks = {
  skipLogic: `${DOCS_BASE_URL}/design-protocols/key-concepts/skip-logic/`,
} as const;
