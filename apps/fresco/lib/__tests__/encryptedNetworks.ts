import type { NcEncryptionHeader, NcNetwork } from '@codaco/shared-consts';

// Deterministic stand-ins for salts, IVs and ciphertexts. Hosts never decrypt
// anything, so only the shape of these values matters.
const bytes = (length: number, offset: number) =>
  Array.from({ length }, (_, index) => (index * 37 + offset) % 256);

const header: NcEncryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: bytes(16, 1),
  },
  check: { iv: bytes(12, 2), data: bytes(48, 3) },
};

/**
 * An interview whose participant has chosen a passphrase. The header is the
 * only record of the salt and the check value: a host that drops it makes the
 * interview ask for a new passphrase, and every answer encrypted under the old
 * one becomes unreadable. It also keeps a schema 8 value (`{ iv, salt }`),
 * because a schema 8 interview that later gains a passphrase holds both.
 */
export const networkWithEncryptionHeader: NcNetwork = {
  encryption: header,
  ego: { _uid: 'ego-1', attributes: {} },
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: bytes(48, 4) },
      _secureAttributes: { name: { iv: bytes(12, 5) } },
    },
    {
      _uid: 'node-2',
      type: 'person',
      attributes: { name: bytes(48, 6) },
      _secureAttributes: { name: { iv: bytes(12, 7), salt: bytes(16, 8) } },
    },
  ],
  edges: [],
};

/** An interview collected under schema 8: no header, a salt on every value. */
export const schema8EncryptedNetwork: NcNetwork = {
  ego: { _uid: 'ego-1', attributes: {} },
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: bytes(48, 9) },
      _secureAttributes: { name: { iv: bytes(12, 10), salt: bytes(16, 11) } },
    },
  ],
  edges: [],
};
