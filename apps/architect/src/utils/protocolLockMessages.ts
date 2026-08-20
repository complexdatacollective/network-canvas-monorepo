import type { ProtocolLockState } from '~/ducks/modules/app';

/**
 * Every surface that can refuse a commit because this tab does not hold the
 * saved copy of the protocol.
 *
 * The list is a value rather than only a type so that the tables below and the
 * tests over them are exhaustive against the SAME list: a surface added here
 * and nowhere else fails to compile, and one whose message reads like another
 * surface's fails a test rather than reaching a researcher.
 *
 * - `stage` — the stage editor's own Finished Editing.
 * - `nested-editor` — a nested editor whose Finish would write the canonical
 *   protocol.
 * - `api-key` — the API Key Browser's Create Key, which writes the protocol's
 *   own `assetManifest`.
 * - `asset-import-…` — adding a resource file, which writes a blob into a
 *   store keyed by protocol id and then names it in the manifest. This is the
 *   one surface that is not itself the thing holding the reclaim, so it is
 *   listed once per blocker; see `assetImportSurface`.
 */
export const REFUSAL_SURFACES = [
  'stage',
  'nested-editor',
  'api-key',
  'asset-import-stage-draft',
  'asset-import-nested-editor',
] as const;

export type RefusalSurface = (typeof REFUSAL_SURFACES)[number];

declare const refusalMessageBrand: unique symbol;

/**
 * A refusal sentence, which nothing outside this module can produce.
 *
 * The brand is the enforcement the surface table alone cannot give: a payload
 * that carries a lock refusal declares its message as this type, so a fourth
 * surface writing its own sentences is a build error rather than a divergence
 * nobody notices. It is why the claim above is a claim about the code and not
 * a request in a comment.
 */
export type RefusalMessage = string & {
  readonly [refusalMessageBrand]: true;
};

/**
 * Why a commit raised in this tab was refused, or `null` when it may proceed.
 *
 * Every surface refuses for exactly the same two reasons, and what differs
 * between them is only the way OUT: the stage editor has a three-action choice
 * waiting on it, a nested editor is itself the thing that has to be resolved
 * first, the API Key Browser's work is a single key that has to be created
 * again afterwards, and a resource file has to be added again. So the way out
 * is a per-surface parameter, and everything else is shared.
 *
 * One whole sentence per case, never assembled from fragments, so all of it can
 * be localised.
 */
const RECLAIM_BLOCKED_MESSAGES: Record<RefusalSurface, string> = {
  'stage':
    'These changes cannot be saved over the version the other tab saved. Choose whether to keep them or discard them first.',
  'nested-editor':
    'These changes cannot be saved over the version the other tab saved. Cancel this editor to continue, and you will be asked to confirm before anything in it is discarded.',
  // By the time this is reached both of the key form's fields hold something,
  // so that form is itself one of the things the reclaim is waiting on (see
  // `useNestedDraftDialog`). Pointing at a stage's unsaved changes instead
  // would send the researcher to answer a question that is not being asked.
  'api-key':
    'These changes cannot be saved over the version the other tab saved. Cancel this form to let the saved copy be read back, then create the key again.',
  // The two shapes a blocked reclaim has (#1387), named apart because the
  // researcher adding a file is not the one holding the reclaim up: each of
  // these has to send them to the dialog that is actually on screen.
  'asset-import-stage-draft':
    'These changes cannot be saved over the version the other tab saved. Choose whether to keep your unsaved changes to that stage or discard them, then add the file again.',
  'asset-import-nested-editor':
    'These changes cannot be saved over the version the other tab saved. Finish or cancel the editor you still have open, then add the file again.',
};

const OPEN_ELSEWHERE_MESSAGES: Record<RefusalSurface, string> = {
  'stage':
    'This protocol is open in another tab, which holds the saved copy. Close the other tab to save these changes here.',
  'nested-editor':
    'This protocol is open in another tab, which holds the saved copy. Close the other tab to save these changes here.',
  'api-key':
    'This protocol is open in another tab, which holds the saved copy. Close the other tab, then create the key again.',
  // No reclaim is under way, so neither blocker is on screen: both asset-import
  // surfaces say the one thing that is true.
  'asset-import-stage-draft':
    'This protocol is open in another tab, which holds the saved copy. Close the other tab, then add the file again.',
  'asset-import-nested-editor':
    'This protocol is open in another tab, which holds the saved copy. Close the other tab, then add the file again.',
};

/**
 * Which asset-import surface a refusal is being raised from.
 *
 * `blockedByNestedEditor` must be the live answer to the same question
 * `useProtocolTabLock` branches on when it sets `reclaim-blocked`
 * (`hasOpenNestedEditor()`) — it is checked there FIRST, before stage-draft
 * dirtiness, and it is what decides which of `NestedDraftReclaimDialog` and
 * `StageDraftConflictDialog` is the one on screen. Asking any other question
 * here sends the researcher to answer one that nobody is asking.
 */
export const assetImportSurface = (
  blockedByNestedEditor: boolean,
): RefusalSurface =>
  blockedByNestedEditor
    ? 'asset-import-nested-editor'
    : 'asset-import-stage-draft';

export const refusedCommitMessage = (
  lockState: ProtocolLockState,
  surface: RefusalSurface,
): RefusalMessage | null => {
  if (lockState === 'owned') return null;

  const message =
    lockState === 'reclaim-blocked'
      ? RECLAIM_BLOCKED_MESSAGES[surface]
      : OPEN_ELSEWHERE_MESSAGES[surface];

  // The one place the brand is applied, which is what makes it mean "this
  // came from the table above".
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return message as RefusalMessage;
};
