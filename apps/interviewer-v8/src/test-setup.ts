import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// PBKDF2 at the production 600,000 iterations dominates unit-test time and,
// across parallel vitest workers, saturates CI cores so badly that even
// unrelated tests time out. The vault stores kdfIterations per record and
// unlocks with the stored value, so a tiny count exercises the identical
// WebCrypto path — wrap/unwrap round-trips and wrong-secret AES-KW integrity
// failures behave exactly the same. Only the constant is replaced; every
// function stays real. The production value itself remains pinned by
// cryptoRecords.test.ts against the unmocked module via vi.importActual.
vi.mock('~/lib/vault/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/vault/crypto')>()),
  PBKDF2_ITERATIONS: 10,
}));

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; components that measure (e.g. DeckCard's
// fitted heading clamp, ProtocolDeck's section sizing) just never observe a
// resize under test — jsdom has no layout to measure anyway.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
