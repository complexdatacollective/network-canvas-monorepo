import { createContext } from 'react';

/**
 * How a host learns that one of this package's dialogs is holding unsaved
 * work, so that ITS ways out — Back, a link, a refresh — can ask before they
 * throw it away.
 *
 * The dialog guards its own dismissal (`useDiscardDraftGuard`), but leaving
 * the page is not a dismissal: the dialog is unmounted with the editor around
 * it, and the stage's draft says nothing about a row that has not been added
 * yet. A host passes a function that records `hasDraft` and answers with the
 * way to forget it; a dialog registers while it is open. `hasDraft` is asked
 * at the moment of leaving, never sampled.
 *
 * Optional: a host that provides nothing gets dialogs that guard only their
 * own dismissal, as before.
 */
export type DialogDraftRegistrar = (hasDraft: () => boolean) => () => void;

export const DialogDraftRegistrarContext = createContext<
  DialogDraftRegistrar | undefined
>(undefined);
