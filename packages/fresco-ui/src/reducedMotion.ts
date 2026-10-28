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
 * Set on the document root by the outermost `AnimationProvider` while its
 * setting is `always` or `never`, and absent while it follows the operating system. CSS
 * (the `motion-reduce:` / `motion-safe:` variants and the global reduced-motion
 * rule in `@codaco/tailwind-config`) and code outside React read it. It sits on
 * the root rather than on a wrapper element so that popups portalled to
 * `document.body` are covered too.
 */
export const REDUCED_MOTION_ATTRIBUTE = 'data-reduced-motion';

const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

type ReducedMotionScope = {
  setting: ReducedMotionSetting;
  /** Whether an `AnimationProvider` encloses this point in the tree. */
  provided: boolean;
};

/**
 * Provided by `AnimationProvider`. Without one the setting is `user`, so code
 * rendered outside a provider follows the operating system, as it always has.
 *
 * The setting is one policy for the whole document, decided by the outermost
 * provider: CSS can only read it from the document root, so React has to
 * agree with that. A provider nested inside another inherits the enclosing
 * setting and ignores its own `reducedMotion`.
 */
export const ReducedMotionContext = createContext<ReducedMotionScope>({
  setting: 'user',
  provided: false,
});

/**
 * Whether to reduce motion, as the enclosing `AnimationProvider` resolves it.
 * Use this instead of Motion's `useReducedMotion`, which reads only the
 * operating system and so ignores a provider set to `always` or `never`.
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

// `nodeType` rather than `instanceof Document`: the global is absent without a
// DOM, and a document from another window (an iframe's) is not an instance of
// this window's `Document`.
const DOCUMENT_NODE = 9;
const isDocument = (node: Node): node is Document =>
  node.nodeType === DOCUMENT_NODE;

/**
 * Whether to reduce motion, for code outside React (event handlers, scroll
 * helpers, imperative animation loops). Reads the attribute `AnimationProvider`
 * puts on the root of `node`'s document, then falls back to that document's
 * window's system preference. Without a DOM it answers `false`.
 */
export function prefersReducedMotion(node?: Node | null): boolean {
  const ownerDocument = node
    ? isDocument(node)
      ? node
      : node.ownerDocument
    : typeof document === 'undefined'
      ? null
      : document;
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

// The outermost providers mounted in each document, most recent last. Usually
// there is one. A Storybook docs page mounts one per story, all with the same
// setting; were they to differ, the most recently mounted would own the
// attribute, since separate React roots cannot see one another's context.
const rootClaims = new Map<Document, { setting: ReducedMotionSetting }[]>();

function applyRootClaims(ownerDocument: Document) {
  const claims = rootClaims.get(ownerDocument) ?? [];
  const setting = claims.at(-1)?.setting ?? 'user';

  const root = ownerDocument.documentElement;
  if (setting === 'user') root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
  else root.setAttribute(REDUCED_MOTION_ATTRIBUTE, setting);
}

/**
 * Mirrors the outermost provider's setting onto the document root for as long
 * as it is mounted; a nested provider (`owner` false) leaves it alone. A layout
 * effect, so the attribute is in place before the first paint that CSS keyed
 * off it affects.
 */
export function useReducedMotionRootAttribute(
  setting: ReducedMotionSetting,
  owner: boolean,
) {
  useLayoutEffect(() => {
    if (!owner) return undefined;

    const ownerDocument = document;
    const claim = { setting };
    rootClaims.set(ownerDocument, [
      ...(rootClaims.get(ownerDocument) ?? []),
      claim,
    ]);
    applyRootClaims(ownerDocument);

    return () => {
      const remaining = (rootClaims.get(ownerDocument) ?? []).filter(
        (other) => other !== claim,
      );
      if (remaining.length > 0) rootClaims.set(ownerDocument, remaining);
      else rootClaims.delete(ownerDocument);
      applyRootClaims(ownerDocument);
    };
  }, [setting, owner]);
}
