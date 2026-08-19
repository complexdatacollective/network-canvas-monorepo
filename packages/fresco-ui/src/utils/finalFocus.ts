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

/**
 * Whether `element` is worth handing to Base UI as a focus-return target at
 * all. Exported because EVERY path that names a target explicitly needs it: an
 * explicit `finalFocus` bypasses Base UI's own connectivity check, so a target
 * that has since been removed is strictly worse than answering "no opinion".
 */
/**
 * Whether `node` is something meaningfully HOLDING focus right now.
 *
 * The STATE question, and deliberately separate from the destination question
 * below. "Is anyone holding focus?" and "may I hand Base UI this element as a
 * focus-return target?" differ in exactly one way, and it matters: a target has
 * to be an `HTMLElement`, because that is what Base UI's `finalFocus` accepts —
 * but plenty of things that are not `HTMLElement`s can legitimately hold focus.
 * An `<a href>` or a `tabindex` inside an inline `<svg>` focuses as an
 * `SVGElement`, as does a `tabindex` on MathML.
 *
 * Asking the destination question about live focus therefore reports a real
 * focus owner as "nothing is focused", and whoever asked then moves focus away
 * from someone who was using it. No interface in this repo focuses a non-HTML
 * element today, so the two predicates currently agree on every element the
 * products actually render — but this is a published library, a consumer can
 * render one, and the two callers below ask the STATE question, so they get
 * the predicate that answers it rather than the one that happens to agree.
 *
 * `body` and `documentElement` are rejected for the same reason the destination
 * predicate rejects them: the browser parks focus there when nothing owns it.
 */
export const holdsFocus = (node: Node | null | undefined): node is Element =>
  node instanceof Element &&
  node.isConnected &&
  node !== node.ownerDocument.body &&
  node !== node.ownerDocument.documentElement;

/**
 * Whether `element` is worth handing to Base UI as a focus-return target.
 *
 * The DESTINATION question: `holdsFocus` plus the `HTMLElement` typing Base
 * UI's `finalFocus` requires. Composed rather than restated, so the shared
 * half — the `body`/`documentElement`/disconnected rejections — cannot drift
 * between the two.
 *
 * Why those rejections: a disconnected node cannot be focused, and
 * `document.body` is worse than nothing — Base UI resolves a return target
 * through `getFirstTabbableElement`, which for `body` yields the FIRST TABBABLE
 * ELEMENT IN THE DOCUMENT. Handing it `body` would send focus to the page
 * header on every close, exactly the "focus restarts at the header" symptom
 * this exists to remove. Base UI's own default path excludes `body` for the
 * same reason, and an explicit target bypasses that check. `<html>` is as bad,
 * and for the same reason: not tabbable itself, so it resolves to the
 * document's first tabbable element.
 */
export const isUsableFinalFocusTarget = (
  element: HTMLElement | null | undefined,
): element is HTMLElement => holdsFocus(element);

/**
 * Narrows an arbitrary node — in practice `document.activeElement`, which is
 * typed `Element | null` — to a focus-return target worth naming, or `null`.
 *
 * The single place the "is this an HTMLElement, and is it usable?" pair is
 * written. Every caller that reads the active element to remember it, or to ask
 * whether focus has meaningfully moved, goes through here so the two halves
 * cannot drift apart.
 */
export const asFinalFocusTarget = (
  node: Node | null | undefined,
): HTMLElement | null =>
  node instanceof HTMLElement && isUsableFinalFocusTarget(node) ? node : null;

const resolveOne = (target: FinalFocusTarget): HTMLElement | null => {
  if (!target) return null;

  const element =
    typeof target === 'function'
      ? target()
      : 'current' in target
        ? target.current
        : target;

  return isUsableFinalFocusTarget(element) ? element : null;
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
