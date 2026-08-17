// The content identity of a published version (#1276): a Merkle-style hash
// over the section-hash map, WITHOUT the manifest's parent pointer.
// manifestHash() bakes history into the digest, so two drafts converging on
// identical content would hash differently; the version hash deliberately
// does not, which is what makes republish-identical idempotent and lets
// convergent drafts deduplicate into one version.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { canonicalize } from '@codaco/studio-sync/apply';

export function versionContentHash(
  sectionHashes: Record<string, string>,
): string {
  return bytesToHex(
    sha256(utf8ToBytes(canonicalize({ sections: sectionHashes }))),
  );
}
