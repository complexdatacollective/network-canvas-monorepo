import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// waitFor/findBy default to 1s, which real PBKDF2 (600k iterations) blows
// past on loaded CI runners. Tests still resolve as soon as the condition
// holds — this is headroom, not a slowdown.
configure({ asyncUtilTimeout: 10_000 });

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
