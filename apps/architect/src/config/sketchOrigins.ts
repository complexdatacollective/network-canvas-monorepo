// Origins allowed to send a protocol to Architect's /import-from-sketch route
// (see components/SketchImport). Exact origins only: the comparison is against
// `MessageEvent.origin`, which is always scheme + host (+ port), so a prefix or
// substring check would admit look-alike hosts.
const SKETCH_ORIGINS: readonly string[] = [
  'https://sketch.networkcanvas.com',
  'https://sketch.networkcanvas.dev',
  'https://sketch-networkcanvas.netlify.app',
];

// Netlify deploy previews and branch deploys: `<label>--sketch-networkcanvas`.
// Anchored at both ends, and the label cannot contain a dot, so no other host
// can end in this suffix and pass. A preview runs whatever code its pull
// request contains (fork PRs included), so only a non-production Architect
// build (`allowPreviews`) trusts one.
const SKETCH_DEPLOY_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+--sketch-networkcanvas\.netlify\.app$/;

// Sketch's Vite dev server. Accepted only by a development build of Architect.
export const SKETCH_DEV_ORIGIN = 'http://localhost:5186';

export function isAllowedSketchOrigin(
  origin: string,
  { dev, allowPreviews }: { dev: boolean; allowPreviews: boolean },
): boolean {
  if (SKETCH_ORIGINS.includes(origin)) return true;
  if (allowPreviews && SKETCH_DEPLOY_PREVIEW_ORIGIN.test(origin)) return true;
  return dev && origin === SKETCH_DEV_ORIGIN;
}
