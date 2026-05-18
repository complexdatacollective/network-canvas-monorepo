import type { StageSubject } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

export default function collectNetworkValues(
  network: NcNetwork,
  subject: Extract<StageSubject, { entity: 'node' | 'edge' }>,
  attribute: string,
  excludeEntityId?: string,
) {
  const entities: (NcNode | NcEdge)[] =
    subject.entity === 'node' ? network.nodes : network.edges;

  return entities
    .filter((e) => e[entityPrimaryKeyProperty] !== excludeEntityId)
    .map((e) => e[entityAttributesProperty][attribute]);
}
