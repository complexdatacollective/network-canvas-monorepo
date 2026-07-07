import type { ProtocolWithCounts } from '~/lib/db/types';

// A Geospatial stage renders an online map (tile server), so a protocol
// that contains one can't be administered while offline.
export function protocolRequiresInternet(
  protocol: ProtocolWithCounts,
): boolean {
  return protocol.protocol.stages.some((stage) => stage.type === 'Geospatial');
}
