import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import {
  type AdditionPlan,
  type Family,
  type PedigreeConfig,
  type PlannedLink,
  type PlannedTwin,
  TWIN_KIND_BY_ZYGOSITY,
} from './model';
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

/** The attributes recording a link. Whether a parent carried the
 * pregnancy is left unrecorded while not known, told apart from "No". */
export const linkAttributesFor = (
  config: PedigreeConfig,
  link: PlannedLink,
) => ({
  [config.kindAttribute]: [link.kind],
  ...(link.kind === 'partner'
    ? { [config.currentPartnerAttribute]: link.isCurrentPartner ?? true }
    : link.isGestationalCarrier === undefined
      ? {}
      : { [config.gestationalCarrierAttribute]: link.isGestationalCarrier }),
});

/** The attributes recording twins: their zygosity, as the relationship
 * kind. */
export const twinAttributesFor = (
  config: PedigreeConfig,
  twin: PlannedTwin,
) => ({
  [config.kindAttribute]: [TWIN_KIND_BY_ZYGOSITY[twin.zygosity]],
});

/**
 * The planned links the network does not record yet. An ordered compare, not
 * `findEdge`: a parent edge always runs from the parent, so a stored edge the
 * other way round is a different link.
 */
const unrecordedLinks = (
  links: readonly PlannedLink[],
  edges: readonly NcEdge[],
  relationshipType: string,
): PlannedLink[] =>
  links.filter(
    (link) =>
      !edges.some(
        (existing) =>
          existing.type === relationshipType &&
          existing.from === link.source &&
          existing.to === link.target,
      ),
  );

/**
 * The edges drawn while a relative is being added: the recorded edges as the
 * addition leaves them, and a draft edge for each planned link the network
 * does not record yet and each planned twin. While the addition is being
 * recorded, part of it is already in the network, and drawn once.
 */
export function edgesDrawnForAddition(
  plan: AdditionPlan,
  edges: readonly NcEdge[],
  config: PedigreeConfig,
): NcEdge[] {
  // A stand-in whose place the addition fills gives way, and identical twins
  // whose genetic parents it makes differ are not known to be identical.
  const removedLinks = new Set(plan.removedLinkIds ?? []);
  const changedTwins = new Map(
    (plan.changedTwins ?? []).map((twin) => [twin.linkId, twin.zygosity]),
  );
  // The twins a new sibling joins were carried by whoever carried them; a
  // new parent who carried the anchor replaces whoever was recorded as
  // having, and a biological parent a new genetic parent takes the place
  // of is the kind of parent the participant said instead.
  const recarried = new Map(
    (plan.carrierUpdates ?? []).map((update) => [update.linkId, update]),
  );
  const keptEdges = edges
    .filter((edge) => !removedLinks.has(edge[entityPrimaryKeyProperty]))
    .map((edge) => {
      const linkId = edge[entityPrimaryKeyProperty];
      const update = recarried.get(linkId);
      if (update) {
        const {
          [config.gestationalCarrierAttribute]: _recorded,
          ...attributes
        } = edge[entityAttributesProperty];
        const carries = update.isGestationalCarrier;
        return {
          ...edge,
          [entityAttributesProperty]: {
            ...attributes,
            [config.kindAttribute]: [update.kind],
            ...(carries === undefined
              ? {}
              : { [config.gestationalCarrierAttribute]: carries }),
          },
        };
      }
      const zygosity = changedTwins.get(linkId);
      return zygosity
        ? {
            ...edge,
            [entityAttributesProperty]: {
              ...edge[entityAttributesProperty],
              [config.kindAttribute]: [TWIN_KIND_BY_ZYGOSITY[zygosity]],
            },
          }
        : edge;
    });
  const draftEdges: NcEdge[] = unrecordedLinks(
    plan.links,
    edges,
    config.relationshipType,
  ).map((link, index) => ({
    [entityPrimaryKeyProperty]: `draft-${index}`,
    type: config.relationshipType,
    from: link.source,
    to: link.target,
    [entityAttributesProperty]: linkAttributesFor(config, link),
  }));
  const draftTwinEdges: NcEdge[] = (plan.twins ?? []).map((twin, index) => ({
    [entityPrimaryKeyProperty]: `draft-twin-${index}`,
    type: config.relationshipType,
    from: twin.source,
    to: twin.target,
    [entityAttributesProperty]: twinAttributesFor(config, twin),
  }));
  return [...keptEdges, ...draftEdges, ...draftTwinEdges];
}
