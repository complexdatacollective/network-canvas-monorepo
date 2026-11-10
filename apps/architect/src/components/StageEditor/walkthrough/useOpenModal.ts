import { useSyncExternalStore } from 'react';

export type OpenModal = Readonly<{
  /** The modal's portal node, the one part of the page it leaves operable. */
  layer: HTMLElement;
  popup: HTMLElement;
  title: string;
  /** Distinct for each modal opened. */
  serial: number;
}>;

const POPUP = '[role="dialog"], [role="alertdialog"]';

/** The popup a modal's own portal holds, not one nested inside it. */
function popupOf(layer: HTMLElement): HTMLElement | null {
  for (const popup of layer.querySelectorAll<HTMLElement>(POPUP)) {
    if (popup.closest('[data-base-ui-portal]') === layer) return popup;
  }
  return null;
}

function titleOf(popup: HTMLElement): string {
  const labelledBy = popup.getAttribute('aria-labelledby');
  const label =
    labelledBy === null ? null : popup.ownerDocument.getElementById(labelledBy);
  return (label?.textContent ?? popup.getAttribute('aria-label') ?? '').trim();
}

let cached: readonly OpenModal[] = [];
let nextSerial = 0;
const serials = new WeakMap<HTMLElement, number>();

const serialOf = (popup: HTMLElement) => {
  const known = serials.get(popup);
  if (known !== undefined) return known;
  nextSerial += 1;
  serials.set(popup, nextSerial);
  return nextSerial;
};

const same = (a: readonly OpenModal[], b: readonly OpenModal[]) =>
  a.length === b.length &&
  a.every((modal, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      modal.layer === other.layer &&
      modal.popup === other.popup &&
      modal.title === other.title
    );
  });

/**
 * The fresco-ui modals open on the page, bottom first. A nested modal is
 * portalled into its parent's layer, so document order is stacking order.
 */
function readOpenModals(): readonly OpenModal[] {
  const next: OpenModal[] = [];
  for (const backdrop of document.querySelectorAll('[data-modal-backdrop]')) {
    const layer = backdrop.closest<HTMLElement>('[data-base-ui-portal]');
    if (layer === null) continue;
    const popup = popupOf(layer);
    if (popup === null) continue;
    next.push({ layer, popup, title: titleOf(popup), serial: serialOf(popup) });
  }
  if (!same(cached, next)) cached = next;
  return cached;
}

const pageListeners = new Set<() => void>();
let pageObserver: MutationObserver | undefined;

/** Calls back whenever the page's DOM changes, through one shared observer. */
export function subscribeToPage(onChange: () => void) {
  pageListeners.add(onChange);
  if (pageObserver === undefined) {
    pageObserver = new MutationObserver(() => {
      for (const listener of pageListeners) listener();
    });
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  return () => {
    pageListeners.delete(onChange);
    if (pageListeners.size === 0) {
      pageObserver?.disconnect();
      pageObserver = undefined;
    }
  };
}

/**
 * A modal makes the rest of the page inert, so anything that must stay usable
 * while one is open has to render inside the topmost modal's layer.
 */
export function useOpenModals(): readonly OpenModal[] {
  return useSyncExternalStore(subscribeToPage, readOpenModals, () => cached);
}
