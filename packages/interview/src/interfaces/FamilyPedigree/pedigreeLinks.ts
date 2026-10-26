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
