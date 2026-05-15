import { hash } from 'ohash';

/**
 * Computes the dedup hash for a protocol from its structural definition only
 * (codebook + stages). Metadata fields — name, description, lastModified,
 * assetManifest, experiments — are excluded so two protocols with the same
 * interview structure produce the same hash regardless of cosmetic differences.
 *
 * Single source of truth for protocol hashing across:
 *   - Fresco-next protocol import (duplicate detection)
 *   - Fresco-next v7→v8 migration script
 *   - Interview package analytics (forwarded as protocol_hash super property)
 *   - Network-exporters (already reads protocol.hash from caller)
 */
export function hashProtocol(protocol: {
  codebook: unknown;
  stages: unknown;
}): string {
  return hash({ codebook: protocol.codebook, stages: protocol.stages });
}
