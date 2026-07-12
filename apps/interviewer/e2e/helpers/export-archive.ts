// Count <node> elements inside the GraphML <graph>. Robust to attribute order.
export function graphmlNodeCount(graphml: string): number {
  const matches = graphml.match(/<node[\s>]/g);
  return matches ? matches.length : 0;
}

// Find an entry whose filename ends with the given suffix; return its text.
export function readEntry(
  files: Record<string, string>,
  suffix: string,
): string | undefined {
  const key = Object.keys(files).find((k) => k.endsWith(suffix));
  return key ? files[key] : undefined;
}
