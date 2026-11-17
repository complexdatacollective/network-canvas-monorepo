// The Content-Security-Policy directives a <meta http-equiv> can express — i.e.
// everything except frame-ancestors, which is header-only and stays in
// public/_headers. It is injected into the built HTML (see injectCspMeta in
// vite.config.ts) rather than served purely as an HTTP header so that a change
// to it rides the service worker's content-revisioning: because the app
// precaches its HTML shell, a header-only CSP change is frozen in the cached
// response and never reaches already-installed clients, whereas a change to
// this in-content policy alters the HTML, bumps its precache revision, and
// propagates on the next update.
const DIRECTIVES = [
  "default-src 'self'",
  // No 'wasm-unsafe-eval': mapbox-gl compiles its right-to-left text shaper
  // (WebAssembly) inside its module worker, a same-origin /assets file that
  // runs under its own response headers rather than this page policy. A
  // header that put this policy on /assets would fail that compile for every
  // map tile with right-to-left text.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // protocol-review.networkcanvas.com is the automated protocol review
  // service (PROTOCOL_REVIEW_SERVICE_URL in workers/protocol-review's
  // contract, which the Node-loaded Vite config cannot import; a test beside
  // this file keeps the two in step).
  "connect-src 'self' data: blob: https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com https://protocol-review.networkcanvas.com",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
];

/**
 * The policy for one build.
 *
 * `reviewServiceOverride` is the build's VITE_PROTOCOL_REVIEW_URL, which
 * points the app at another protocol review service
 * (src/protocolReview/reviewClient.ts). A build that sets it may reach that
 * origin as well: without this the browser would block every review request
 * such a build makes. A value that is not a URL fails the build here, where
 * the app would otherwise fail on its first request.
 */
export const contentSecurityPolicy = (
  reviewServiceOverride: string | undefined,
): string => {
  const origin = reviewServiceOverride
    ? new URL(reviewServiceOverride).origin
    : null;
  return DIRECTIVES.map((directive) =>
    origin !== null && directive.startsWith('connect-src ')
      ? `${directive} ${origin}`
      : directive,
  ).join('; ');
};
