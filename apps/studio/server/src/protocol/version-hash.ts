import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { canonicalize } from '@codaco/studio-sync/apply';

// Deliberately excludes the manifest's parent pointer, which manifestHash
// includes: without history in the digest, republishing identical content is
// idempotent and convergent drafts deduplicate into one version.
export function versionContentHash(
  sectionHashes: Record<string, string>,
): string {
  return bytesToHex(
    sha256(utf8ToBytes(canonicalize({ sections: sectionHashes }))),
  );
}
