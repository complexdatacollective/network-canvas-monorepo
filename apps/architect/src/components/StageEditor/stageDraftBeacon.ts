import { isEqual } from 'es-toolkit/compat';
import { useSyncExternalStore } from 'react';

import type { InterfaceTextUpdate, Stage } from '@codaco/protocol-validation';

/**
 * What the stage editor currently on screen is holding, published where the
 * rest of Architect can read it.
 *
 * The editor is the protocol-builder package's, and its document lives in that
 * form's own store — inside a React provider, on a route. Four things outside
 * that provider have to know about it, and three of them ask from a `popstate`
 * or `beforeunload` handler rather than from a render: the navigation guard,
 * the route guard, and the cross-tab lock all decide whether unsaved work is
 * about to be lost. So the answer is published to a module singleton that can
 * be read imperatively, and subscribed to where a component has to follow it.
 *
 * One editor is open at a time — it is a route — so one value, not a registry.
 */
type StageDraftBeacon = Readonly<{
  /** A stage editor is mounted. */
  open: boolean;
  /**
   * Whether the editor on screen may write: the host granted it the stage.
   *
   * An editor opened while another tab holds the protocol is read-only from
   * its first render, so it can never hold anything the protocol does not —
   * it is a page to look at, and handing editing back to this tab leaves
   * nothing to weigh. An editor that WAS granted the stage keeps that grant
   * when the tab is demoted, so its work survives until the researcher
   * decides what to do with it (`useProtocolAccessMode`).
   */
  editing: boolean;
  /**
   * Whether it holds anything the protocol does not.
   *
   * A deep comparison against the document the editor opened on, so undoing an
   * edit by hand reports clean again. Codebook edits are NOT part of it: they
   * commit immediately under their own lock and survive this editor being
   * cancelled, so they are not this draft's to lose. Neither are the shared
   * words the protocol already holds, for the same reason; but wording the
   * researcher gave a shared entry the protocol does not hold yet is saved
   * only with the stage, so it is.
   */
  dirty: boolean;
  /**
   * The stage as it stands on screen, whole — identity included — so a preview
   * or a rescue download builds the protocol the researcher is looking at.
   */
  stage: Stage | undefined;
  /**
   * The shared words the stage brings in that the protocol does not hold yet,
   * as a save would write them with it (`pendingSharedWording`): part of the
   * protocol the researcher is looking at, for the same readers.
   */
  interfaceText: readonly InterfaceTextUpdate[];
}>;

const NO_WORDS: readonly InterfaceTextUpdate[] = Object.freeze([]);

const NO_PENDING_WORDS = Object.freeze({ words: NO_WORDS, reworded: false });

const CLOSED: StageDraftBeacon = Object.freeze({
  open: false,
  editing: false,
  dirty: false,
  stage: undefined,
  interfaceText: NO_WORDS,
});

let current: StageDraftBeacon = CLOSED;
const listeners = new Set<() => void>();

/** What the editor is holding right now, for a handler that cannot re-render. */
export const readStageDraft = (): StageDraftBeacon => current;

export function subscribeToStageDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(next: StageDraftBeacon): void {
  current = next;
  // A copy, because a listener may unsubscribe while this is running.
  const notifying = Array.from(listeners);
  for (const listener of notifying) listener();
}

/**
 * Said by the editor on every change to its form.
 *
 * Undebounced on purpose: the reading is taken from the form's own store when
 * it changes, so there is no window in which a guard can read a draft that is
 * one keystroke behind the screen — which is what every caller of the mirror
 * this replaces had to flush before asking.
 */
export function publishStageDraft(
  stage: Stage,
  committed: Readonly<Record<string, unknown>>,
  draft: Readonly<Record<string, unknown>>,
  editing: boolean,
  /** The shared words held with the stage, when it holds any. */
  interfaceText: Readonly<{
    words: readonly InterfaceTextUpdate[];
    /** Whether any of them is the researcher's rather than Network Canvas's. */
    reworded: boolean;
  }> = NO_PENDING_WORDS,
): void {
  announce({
    open: true,
    editing,
    dirty: interfaceText.reworded || !isEqual(prune(draft), prune(committed)),
    stage,
    interfaceText: interfaceText.words,
  });
}

/** Said when the editor unmounts. */
export function closeStageDraft(): void {
  announce(CLOSED);
}

/**
 * Follows the beacon from a render.
 *
 * `select` must return something the published value already holds — a member
 * of it, or a value derived from one — because `useSyncExternalStore` compares
 * snapshots by identity and a selector that built a new object on every call
 * would never settle.
 */
export function useStageDraft<T>(select: (beacon: StageDraftBeacon) => T): T {
  return useSyncExternalStore(subscribeToStageDraft, () => select(current));
}

/**
 * What a document is compared as, on both sides.
 *
 * A field that is mounted and empty and a field that is not mounted at all are
 * the same thing to a researcher, and the form says the first as an absent
 * value and the second by not being there — so both sides drop absent values
 * and the empty containers that leaves behind. Clearing a field that had a
 * committed value still reads as dirty: the key survives on the committed side
 * only.
 */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const pruned = prune(entry);
    if (
      pruned !== null &&
      typeof pruned === 'object' &&
      !Array.isArray(pruned) &&
      Object.keys(pruned).length === 0
    ) {
      continue;
    }
    result[key] = pruned;
  }
  return result;
}
