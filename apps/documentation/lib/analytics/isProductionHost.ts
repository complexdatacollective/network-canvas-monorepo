// The site is a static export, so one bundle is served from production, from
// every Netlify deploy preview, and from a developer's own machine. A build-time
// production flag can't tell those apart (any `next build` sets NODE_ENV to
// production, which is why deploy previews used to report as production), so
// analytics gates on the origin the visitor actually loaded: only real visits to
// the live site are recorded.
//
// networkcanvas.com has its own copy of this with its own domain list — the
// shared part is a one-line `includes`, and the value here is the list.
const PRODUCTION_HOSTNAMES = ['documentation.networkcanvas.com'];

export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTNAMES.includes(hostname);
}
