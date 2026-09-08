import type { KeysetConfiguration, RootKeyLoader } from './keys.ts';

// Public synthetic-data material. Runtime callers may select this ONLY for a
// local development reset; managed/self-hosted deployments require operator
// configuration. Keeping the loader explicit prevents an absent production
// secret from quietly selecting this known key.
export const developmentKeyConfiguration: KeysetConfiguration = {
  roots: [{ id: 'development-root', reference: 'public-development-root' }],
  pii: {
    current: 'development-v1',
    keys: [{ id: 'development-v1', rootId: 'development-root' }],
  },
  integration: {
    current: 'development-v1',
    keys: [{ id: 'development-v1', rootId: 'development-root' }],
  },
  blindIndex: {
    current: 'development-index-v1',
    keys: [{ id: 'development-index-v1', rootId: 'development-root' }],
  },
};

export const loadDevelopmentRoot: RootKeyLoader = async (reference) => {
  if (reference !== 'public-development-root')
    throw new Error('Unknown development key reference.');
  return Buffer.from('Studio public development root!!');
};
