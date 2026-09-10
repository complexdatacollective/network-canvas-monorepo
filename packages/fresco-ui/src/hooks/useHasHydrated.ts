'use client';

import { useSyncExternalStore } from 'react';

// The answer never changes within one environment, so there is nothing to
// subscribe to. The unsubscribe callback still has to be returned, because
// React calls it on unmount.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Whether this tree is past hydration, for the handful of things that can only
 * be known in a browser: a `window` global, a feature-detection call, a
 * `localStorage` read.
 *
 * Returns `false` on the server and throughout the hydrating render, then
 * `true`. In a client-only render — a Vite app, or a soft navigation that
 * mounts a subtree React never hydrated — it returns `true` on the very first
 * render, because there is no server markup for that subtree to agree with.
 *
 * That last part is the reason this is not the `useState(false)` plus
 * `useEffect(() => setMounted(true), [])` idiom it replaces. That idiom answers
 * "has a passive effect run yet", which is a different question: it is `false`
 * for one committed frame on *every* mount, hydrating or not, so a component
 * that gates content on it flashes its fallback each time it is remounted, and
 * it reaches that first frame through a cascading render the
 * `react(set-state-in-effect)` rule exists to flag. `useSyncExternalStore` with
 * divergent client and server snapshots is React's own answer to the question,
 * and it needs no state and no effect.
 *
 * Use it to defer a browser-only read, not to defer work that is merely slow.
 *
 * `scripts/check-hydration-flag.mjs` fails the build on a hand-rolled
 * `useSyncExternalStore` with constant true/false snapshots, so that shape
 * stays implemented here and nowhere else. It does not — and cannot usefully —
 * detect the mount-flag idiom, which is ordinary code written for many
 * unrelated reasons; the `react(set-state-in-effect)` lint rule is what
 * surfaces those.
 */
export default function useHasHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
