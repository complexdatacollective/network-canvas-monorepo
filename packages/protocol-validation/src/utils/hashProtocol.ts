import { hash } from 'ohash';

import {
  compareLocaleTags,
  type LocalizationDeclaration,
} from '../localization/localeTag.ts';
import type { SchemaVersion } from '../schemas/index.ts';

type UnlocalizedSchemaVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type UnlocalizedProtocol = {
  schemaVersion: UnlocalizedSchemaVersion;
  codebook: unknown;
  stages: unknown;
};

type LocalizedProtocol = {
  schemaVersion: Exclude<SchemaVersion, UnlocalizedSchemaVersion>;
  localization: LocalizationDeclaration;
  codebook: unknown;
  stages: unknown;
};

// Decided by version rather than by the presence of `localization`, which a
// loosely validated older document could carry without it meaning anything.
const isLocalized = (
  protocol: UnlocalizedProtocol | LocalizedProtocol,
): protocol is LocalizedProtocol => protocol.schemaVersion > 8;

/**
 * Computes the dedup hash for a protocol from its structural definition only:
 * codebook and stages, plus, from schema 9, the localization declaration, so
 * that changing the default language or the set of languages changes the
 * protocol's identity. The languages are hashed sorted, because they have no
 * order: two protocols that declare the same languages in different orders
 * are the same protocol. Metadata fields — name, description, lastModified,
 * assetManifest, experiments — are excluded so two protocols with the same
 * interview structure produce the same hash regardless of cosmetic
 * differences. A protocol stored at schema 8 or older keeps the hash of its
 * codebook and stages alone.
 *
 * Single source of truth for protocol hashing across:
 *   - Fresco-next protocol import (duplicate detection)
 *   - Fresco-next v7→v8 migration script
 *   - Interview package analytics (forwarded as protocol_hash super property)
 *   - Network-exporters (already reads protocol.hash from caller)
 */
export function hashProtocol(
  protocol: UnlocalizedProtocol | LocalizedProtocol,
): string {
  if (isLocalized(protocol)) {
    return hash({
      localization: {
        ...protocol.localization,
        locales: protocol.localization.locales.toSorted(compareLocaleTags),
      },
      codebook: protocol.codebook,
      stages: protocol.stages,
    });
  }
  return hash({ codebook: protocol.codebook, stages: protocol.stages });
}
