import { type KeysetConfiguration, loadEncryptionKeys } from '../keys.ts';

// Public deterministic test material. Production roots come only from the
// deployment's injected loader; these bytes must never seed a deployment.
export const rootOne = Buffer.alloc(32, 17);
const rootTwo = Buffer.alloc(32, 93);

export function configuration(): KeysetConfiguration {
  return {
    roots: [
      { id: 'root-1', reference: 'TEST_ROOT_ONE' },
      { id: 'root-2', reference: 'TEST_ROOT_TWO' },
    ],
    pii: {
      current: 'v1',
      keys: [
        { id: 'v1', rootId: 'root-1' },
        { id: 'v2', rootId: 'root-2' },
        { id: 'same-root-new-id', rootId: 'root-1' },
      ],
    },
    integration: {
      current: 'v1',
      keys: [
        { id: 'v1', rootId: 'root-1' },
        { id: 'v2', rootId: 'root-2' },
      ],
    },
    blindIndex: {
      current: 'index-1',
      keys: [
        { id: 'index-1', rootId: 'root-1' },
        { id: 'index-2', rootId: 'root-2' },
        { id: 'same-root-new-index', rootId: 'root-1' },
      ],
    },
  };
}

export function loadTestKeys(config = configuration()) {
  return loadEncryptionKeys(config, async (reference) => {
    if (reference === 'TEST_ROOT_ONE') return rootOne;
    if (reference === 'TEST_ROOT_TWO') return rootTwo;
    throw new Error('Unexpected test root reference');
  });
}
