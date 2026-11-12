const PROBES: ReadonlySet<string> = new Set(['/healthz', '/readyz']);

/**
 * Matched on the path alone and exactly: the maintenance gate exempts what
 * this matches, and exempting one path too many would serve a surface through
 * the window.
 */
export const isProbe = (url: string): boolean => {
  const query = url.indexOf('?');
  return PROBES.has(query === -1 ? url : url.slice(0, query));
};
