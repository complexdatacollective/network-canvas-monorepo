// Count <node> elements inside the GraphML <graph>. Robust to attribute order.
export function graphmlNodeCount(graphml: string): number {
  const matches = graphml.match(/<node[\s>]/g);
  return matches ? matches.length : 0;
}

// Return the text of every archive entry whose filename ends with the suffix.
// An export batch produces one file per session, so a single-match lookup would
// skip (and fail to validate) the rest of the batch.
export function readEntries(
  files: Record<string, string>,
  suffix: string,
): string[] {
  return Object.keys(files)
    .filter((k) => k.endsWith(suffix))
    .map((k) => files[k] ?? '');
}
