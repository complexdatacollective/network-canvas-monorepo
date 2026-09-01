// The site is a static export, so one bundle is served from production, from
// every Netlify deploy preview, and from a developer's own machine. A build-time
// production flag can't tell those apart (any `next build` sets NODE_ENV to
// production), so analytics gates on the origin the visitor actually loaded:
// only real visits to the live site are recorded.
const PRODUCTION_HOSTNAMES = [
  'networkcanvas.com',
  'www.networkcanvas.com',
  'protocolgallery.networkcanvas.com',
];

export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTNAMES.includes(hostname);
}
