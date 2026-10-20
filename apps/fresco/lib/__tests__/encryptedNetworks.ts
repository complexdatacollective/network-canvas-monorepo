import type { NcNetwork } from '@codaco/shared-consts';

// Deterministic stand-ins for salts, IVs and ciphertexts. Hosts never decrypt
// anything, so only the shape of these values matters.
const bytes = (length: number, offset: number) =>
  Array.from({ length }, (_, index) => (index * 37 + offset) % 256);

/**
 * An interview whose participant has chosen a passphrase and given encrypted
 * answers. Nothing about the key is stored: it is derived from the passphrase
 * and the interview's id, so a host keeps each value and its `{ iv }` as they
 * are, and the interview's id unchanged. It also keeps a schema 8 value
 * (`{ iv, salt }`), because a schema 8 interview that later gains a
 * passphrase holds both.
 */
export const encryptedNetwork: NcNetwork = {
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

/** An interview collected under schema 8: a salt on every value. */
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
