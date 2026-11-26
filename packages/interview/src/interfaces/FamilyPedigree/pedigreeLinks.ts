import { type Family, TWIN_KIND_BY_ZYGOSITY } from './model';
import type { PedigreeLink } from './pedigree-layout/types';

/** The family's links as the pedigree layout reads them: its parent and
 * partner links, and a link between each pair of twins. */
export function pedigreeLinksOf(
  family: Pick<Family, 'links' | 'twins'>,
): PedigreeLink[] {
  return [
    ...family.links.map((link) => ({
      source: link.source,
      target: link.target,
      kind: link.kind,
      isActive: link.isCurrentPartner,
      isGestationalCarrier: link.isGestationalCarrier,
    })),
    ...family.twins.map((twin) => ({
      source: twin.source,
      target: twin.target,
      kind: TWIN_KIND_BY_ZYGOSITY[twin.zygosity],
    })),
  ];
}

/**
 * The planned links the network does not record yet. An ordered compare, not
 * `findEdge`: a parent edge always runs from the parent, so a stored edge the
 * other way round is a different link.
 */
export function unrecordedLinks<L extends { source: string; target: string }>(
  links: readonly L[],
  edges: readonly { type: string; from: string; to: string }[],
  relationshipType: string,
): L[] {
  return links.filter(
    (link) =>
      !edges.some(
        (existing) =>
          existing.type === relationshipType &&
          existing.from === link.source &&
          existing.to === link.target,
      ),
  );
}
