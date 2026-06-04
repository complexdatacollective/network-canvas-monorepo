import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import type { BioTriadConfig } from './steps/BioTriadStep';

export function derivePreselection(
  anchorNodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): BioTriadConfig['preselection'] {
  const parentEdges: { source: string; isGestationalCarrier: boolean }[] = [];

  for (const edge of edges.values()) {
    if (
      edge.to === anchorNodeId &&
      edge.attributes[variableConfig.relationshipTypeVariable] !== 'partner'
    ) {
      parentEdges.push({
        source: edge.from,
        isGestationalCarrier:
          edge.attributes[variableConfig.isGestationalCarrierVariable] === true,
      });
    }
  }

  const carrierEdge = parentEdges.find((e) => e.isGestationalCarrier);
  const otherEdges = parentEdges.filter((e) => !e.isGestationalCarrier);

  const preselection: BioTriadConfig['preselection'] = {};

  if (carrierEdge) {
    preselection.eggSource = carrierEdge.source;
    preselection.carrier = 'egg-source';
  }

  if (otherEdges.length > 0) {
    if (carrierEdge) {
      preselection.spermSource = otherEdges[0]?.source;
    } else if (otherEdges.length >= 2) {
      preselection.eggSource = otherEdges[0]?.source;
      preselection.spermSource = otherEdges[1]?.source;
    } else {
      preselection.eggSource = otherEdges[0]?.source;
    }
  }

  return preselection;
}
