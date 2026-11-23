import { useSyncExternalStore } from 'react';

import {
  NOTHING_STAGED,
  type StagedCodebook,
} from '@codaco/protocol-builder/state/stagedCodebook';
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
   * Whether it holds anything the protocol does not: protocol-builder's
   * answer (`StageDraft.unsaved`), which the codebook changes and the shared
   * words changed in the editor are part of.
   */
  dirty: boolean;
  /**
   * The stage as it stands on screen, whole — identity included — so a preview
   * or a rescue download builds the protocol the researcher is looking at.
   */
  stage: Stage | undefined;
  /**
   * The shared words a save would write with the stage
   * (`pendingSharedWording`): the researcher's changes to them, and those the
   * stage is the first to use. Part of the protocol the researcher is looking
   * at, for the same readers.
   */
  interfaceText: readonly InterfaceTextUpdate[];
  /**
   * The codebook changes made in the editor, which a save writes with the
   * stage (see `StagedCodebookStore`): part of the protocol the researcher is
   * looking at, for the same readers.
   */
  codebook: StagedCodebook;
}>;

const NO_WORDS: readonly InterfaceTextUpdate[] = Object.freeze([]);

const CLOSED: StageDraftBeacon = Object.freeze({
  open: false,
  editing: false,
  dirty: false,
  stage: undefined,
  interfaceText: NO_WORDS,
  codebook: NOTHING_STAGED,
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

/** What the editor says about its draft: see `StageDraft`. */
type PublishedDraft = Readonly<{
  stage: Stage;
  unsaved: boolean;
  editing: boolean;
  interfaceText?: readonly InterfaceTextUpdate[];
  codebook?: StagedCodebook;
}>;

/**
 * Said by the editor on every change to its form.
 *
 * Undebounced on purpose: the reading is taken from the form's own store when
 * it changes, so there is no window in which a guard can read a draft that is
 * one keystroke behind the screen — which is what every caller of the mirror
 * this replaces had to flush before asking.
 */
export function publishStageDraft({
  stage,
  unsaved,
  editing,
  interfaceText = NO_WORDS,
  codebook = NOTHING_STAGED,
}: PublishedDraft): void {
  announce({
    open: true,
    editing,
    dirty: unsaved,
    stage,
    interfaceText,
    codebook,
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
