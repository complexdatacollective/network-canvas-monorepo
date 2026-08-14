import type { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { RefObject } from 'react';

/** Base UI's own `finalFocus` prop type, and the pieces of its function form. */
type BaseFinalFocus = NonNullable<BaseDialog.Popup.Props['finalFocus']>;
type BaseFinalFocusFn = Extract<BaseFinalFocus, (...args: never[]) => unknown>;

/** How the popup was closed — 'mouse', 'touch', 'keyboard', … */
export type FinalFocusCloseType = Parameters<BaseFinalFocusFn>[0];

/**
 * What Base UI's function form may return.
 * - an element: focus goes there
 * - `null`: use Base UI's own default target
 * - `false`: do not move focus at all
 */
export type FinalFocusResult = ReturnType<BaseFinalFocusFn>;

/**
 * Normalises any accepted `finalFocus` value to a concrete answer, resolving a
 * ref to its element. Base UI's FUNCTION form may not return a ref, so a
 * wrapper that forwards a caller's `finalFocus` has to resolve it first.
 *
 * `undefined` (nothing declared) and a function answering `undefined` both come
 * back as `null` — "no opinion, use the default" — which leaves `false` as the
 * only way to say "leave focus exactly where it is".
 */
export const normaliseFinalFocus = (
  finalFocus: BaseFinalFocus | undefined,
  closeType: FinalFocusCloseType,
): HTMLElement | null | boolean => {
  if (finalFocus === undefined) return null;
  if (typeof finalFocus === 'boolean') return finalFocus;
  if (typeof finalFocus === 'function') return finalFocus(closeType) ?? null;
  return finalFocus.current;
};

/**
 * Something that can name the control focus should return to when a dialog
 * closes.
 *
 * A function is resolved LAZILY, when focus is actually being returned. That
 * matters more than it looks: a list row unmounts its controls while its editor
 * is open and mounts fresh ones when the editor closes, so an element captured
 * at open time is a dead node by the time it would be focused.
 */
export type FinalFocusTarget =
  | HTMLElement
  | null
  | undefined
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | null | undefined);

const isUsable = (
  element: HTMLElement | null | undefined,
): element is HTMLElement => {
  if (!element) return false;
  // A disconnected node cannot be focused, and `document.body` is worse than
  // nothing: Base UI resolves a return target through `getFirstTabbableElement`,
  // which for `body` yields the FIRST TABBABLE ELEMENT IN THE DOCUMENT. Handing
  // it `body` would send focus to the page header on every close — exactly the
  // "focus restarts at the header" symptom this is meant to remove. Base UI's
  // own default path excludes `body` for the same reason, and an explicit
  // target bypasses that check.
  if (!element.isConnected) return false;
  // `<html>` is as bad as `<body>`, and for the same reason: it is not tabbable
  // itself, so Base UI resolves it to the document's first tabbable element.
  if (element === element.ownerDocument.body) return false;
  if (element === element.ownerDocument.documentElement) return false;
  return true;
};

const resolveOne = (target: FinalFocusTarget): HTMLElement | null => {
  if (!target) return null;

  const element =
    typeof target === 'function'
      ? target()
      : 'current' in target
        ? target.current
        : target;

  return isUsable(element) ? element : null;
};

/**
 * Resolves the first usable target from `targets`, in priority order.
 *
 * Returns `null` when nothing is usable, which is the value Base UI's
 * `finalFocus` treats as "fall back to your own default" — as opposed to
 * `undefined`/`false`, which suppress focus return altogether and would leave
 * focus on `<body>`.
 */
export const resolveFinalFocus = (
  ...targets: FinalFocusTarget[]
): HTMLElement | null => {
  for (const target of targets) {
    const resolved = resolveOne(target);
    if (resolved) return resolved;
  }
  return null;
};
