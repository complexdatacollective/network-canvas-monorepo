import { get, size } from 'es-toolkit/compat';

import {
  type CurrentProtocol,
  type EdgeColor,
  EdgeColorSequence,
  type NodeColor,
  NodeColorSequence,
} from '@codaco/protocol-validation';

export function getNextCategoryColor(
  protocol: CurrentProtocol,
  entity: 'node',
): NodeColor;
export function getNextCategoryColor(
  protocol: CurrentProtocol,
  entity: 'edge' | 'ego',
): EdgeColor;
export function getNextCategoryColor(
  protocol: CurrentProtocol,
  entity: 'node' | 'edge' | 'ego',
): NodeColor | EdgeColor;
export function getNextCategoryColor(
  protocol: CurrentProtocol,
  entity: 'node' | 'edge' | 'ego',
): NodeColor | EdgeColor {
  // Number of existing types, wrapped around when it exceeds the palette size.
  const typeCount = size(get(protocol, ['codebook', entity], {}));

  if (entity === 'node') {
    return (
      NodeColorSequence[typeCount % NodeColorSequence.length] ??
      NodeColorSequence[0]
    );
  }

  return (
    EdgeColorSequence[typeCount % EdgeColorSequence.length] ??
    EdgeColorSequence[0]
  );
}
