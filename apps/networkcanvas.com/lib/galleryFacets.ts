import type { GalleryProtocol } from '~/lib/protocolGallery';

export type FacetOption = {
  value: string;
  count: number;
};

export type FacetSelection = {
  fields: string[];
  edgeGeneration: string[];
};

export const emptyFacetSelection: FacetSelection = {
  fields: [],
  edgeGeneration: [],
};

export function countFacetValues(
  protocols: GalleryProtocol[],
  pick: (protocol: GalleryProtocol) => string[],
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const protocol of protocols) {
    for (const value of new Set(pick(protocol))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .toSorted(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value, 'en'),
    );
}

function matchesAny(values: string[], selected: string[]): boolean {
  return selected.length === 0 || selected.some((s) => values.includes(s));
}

export function applyFacets(
  protocols: GalleryProtocol[],
  selection: FacetSelection,
): GalleryProtocol[] {
  return protocols.filter(
    (protocol) =>
      matchesAny(protocol.fields, selection.fields) &&
      matchesAny(protocol.edgeGeneration, selection.edgeGeneration),
  );
}

export function toggleFacetValue(selected: string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}
