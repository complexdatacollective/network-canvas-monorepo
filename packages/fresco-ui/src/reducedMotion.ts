'use client';

// The one place a React tree consults the operating system directly; every
// other caller goes through `usePrefersReducedMotion` below.
// oxlint-disable-next-line no-restricted-imports -- this module is the resolution the ban points callers to
import { useReducedMotion as useSystemPrefersReducedMotion } from 'motion/react';
import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * How reduced motion is decided: `user` follows the operating system's
 * `prefers-reduced-motion`, `always` and `never` override it. The same values
 * Motion's `MotionConfig` takes.
 */
export type ReducedMotionSetting = 'user' | 'always' | 'never';

/**
 * Set on the document root by `AnimationProvider` while its setting is
 * `always` or `never`, and absent while it follows the operating system. CSS
 * (the `motion-reduce:` / `motion-safe:` variants and the global reduced-motion
 * rule in `@codaco/tailwind-config`) and code outside React read it. It sits on
 * the root rather than on a wrapper element so that popups portalled to
 * `document.body` are covered too.
 */
export const REDUCED_MOTION_ATTRIBUTE = 'data-reduced-motion';

const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

type ReducedMotionScope = {
  setting: ReducedMotionSetting;
  /** How many `AnimationProvider`s enclose this one, so the nearest wins. */
  depth: number;
};

/**
 * Provided by `AnimationProvider`. Without one the setting is `user`, so code
 * rendered outside a provider follows the operating system, as it always has.
 */
export const ReducedMotionContext = createContext<ReducedMotionScope>({
  setting: 'user',
  depth: 0,
});

/**
 * Whether to reduce motion, as the nearest `AnimationProvider` resolves it. Use
 * this instead of Motion's `useReducedMotion`, which reads only the operating
 * system and so ignores a provider set to `always` or `never`.
 *
 * Under `user` it returns exactly what Motion's hook does, `null` included:
 * the operating system's answer is unknown during a server render, so a server
 * and its first client render can disagree, and a caller that renders from the
 * answer must cope with that.
 */
export function usePrefersReducedMotion(): boolean | null {
  const { setting } = useContext(ReducedMotionContext);
  const system = useSystemPrefersReducedMotion();

  if (setting === 'always') return true;
  if (setting === 'never') return false;
  return system;
}

/**
 * Whether to reduce motion, for code outside React (event handlers, scroll
 * helpers, imperative animation loops). Reads the attribute `AnimationProvider`
 * puts on the document root, then falls back to the operating system.
 */
export function prefersReducedMotion(node?: Node | null): boolean {
  const ownerDocument =
    node?.ownerDocument ??
    (node instanceof Document ? node : undefined) ??
    (typeof document === 'undefined' ? undefined : document);
  if (!ownerDocument) return false;

  const setting = ownerDocument.documentElement.getAttribute(
    REDUCED_MOTION_ATTRIBUTE,
  );
  if (setting === 'always') return true;
  if (setting === 'never') return false;

  const view = ownerDocument.defaultView;
  return typeof view?.matchMedia === 'function'
    ? view.matchMedia(SYSTEM_QUERY).matches
    : false;
}

type RootClaim = ReducedMotionScope;

// Every mounted provider's claim on the root attribute. Usually there is one;
// a Storybook docs page mounts a provider per story, and a provider may nest
// inside another, where the innermost one wins as it does for the context.
const rootClaims = new Map<Document, RootClaim[]>();

function applyRootClaims(ownerDocument: Document) {
  let winner: RootClaim | undefined;
  for (const claim of rootClaims.get(ownerDocument) ?? []) {
    if (!winner || claim.depth >= winner.depth) winner = claim;
  }

  const root = ownerDocument.documentElement;
  const setting = winner?.setting ?? 'user';
  if (setting === 'user') root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
  else root.setAttribute(REDUCED_MOTION_ATTRIBUTE, setting);
}

/**
 * Mirrors a provider's setting onto the document root for as long as it is
 * mounted. A layout effect, so the attribute is in place before the first
 * paint that CSS keyed off it affects.
 */
export function useReducedMotionRootAttribute({
  setting,
  depth,
}: ReducedMotionScope) {
  useLayoutEffect(() => {
    const ownerDocument = document;
    const claim: RootClaim = { setting, depth };
    const claims = rootClaims.get(ownerDocument) ?? [];
    claims.push(claim);
    rootClaims.set(ownerDocument, claims);
    applyRootClaims(ownerDocument);

    return () => {
      const remaining = (rootClaims.get(ownerDocument) ?? []).filter(
        (other) => other !== claim,
      );
      if (remaining.length > 0) rootClaims.set(ownerDocument, remaining);
      else rootClaims.delete(ownerDocument);
      applyRootClaims(ownerDocument);
    };
  }, [setting, depth]);
}
