import { isEqual } from 'es-toolkit';
import { isEqual as isEqualDeep } from 'es-toolkit/compat';
import { useMemo } from 'react';

import type { InterfaceTextUpdate } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useProtocolLocalization } from '../localization/ProtocolLocalization.tsx';
import { useStandingStageNameProposal } from '../naming/useStandingStageNameProposal.ts';
import { stageDocument, stageFieldsOf } from '../stageDocument.ts';
import { useStageEdit } from '../stageEdit.tsx';
import { useProtocolContext } from '../state/protocolContext.ts';
import {
  NOTHING_STAGED,
  useStagedCodebookStore,
  type StagedCodebook,
} from '../state/stagedCodebook.ts';
import { standingSharedWord } from './sharedWordingDraft.ts';
import { useStageEditorForm } from './stageEditorContext.ts';

/** The open stage editor's work, as a save would write it. */
export type StageDraft = Readonly<{
  /**
   * The stage as it stands on screen, whole — identity included — so a
   * preview or a rescue download builds the protocol the researcher is
   * looking at. Not checked against the schema: mid-edit it may not satisfy
   * it, so a reader validates the protocol it builds from this.
   */
  stage: SectionDoc;
  /**
   * The shared words a save would write with the stage
   * (`pendingSharedWording`): the researcher's changes to them, and those the
   * stage is the first to use.
   */
  interfaceText: readonly InterfaceTextUpdate[];
  /**
   * The codebook changes made in the editor, which a save writes with the
   * stage (see `StagedCodebookStore`).
   */
  codebook: StagedCodebook;
  /**
   * Whether it holds anything the protocol does not: work the researcher would
   * lose by leaving.
   *
   * A deep comparison against the document the editor opened on, so undoing
   * an edit by hand reads as nothing to lose again. Left out of it:
   * - a name the editor proposed that nobody has touched, which nobody chose;
   * - Network Canvas's wording for a shared entry the stage is the first to
   *   use, which the protocol gains anyway.
   * The codebook changes count while there are any, and so does a shared word
   * that differs from what the protocol shows for it.
   */
  unsaved: boolean;
  /**
   * Whether the editor may write: the host granted it the stage. An editor
   * that was never granted it holds nothing the protocol does not.
   */
  editing: boolean;
}>;

/**
 * The open stage editor's draft, as an external store a host follows.
 *
 * A store rather than a value, for the reason the sections are one: the form
 * changes on every keystroke, and a host that publishes the draft to readers
 * outside React would otherwise re-render its chrome on every one to do it.
 * The snapshot is worked out when it is read, and kept until the form changes,
 * so reading it twice between changes gives the same object.
 */
export type StageDraftStore = Readonly<{
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StageDraft;
}>;

/**
 * The draft of the stage editor this is called inside, or nothing while the
 * stage has not been read yet.
 *
 * For a host's chrome, rendered in the editor's action slot: everything a
 * host needs to know about the work on screen, with the package's own answer
 * to whether any of it would be lost.
 */
export function useStageDraftStore(): StageDraftStore | undefined {
  const { liveDraft, pendingSharedWording, storeApi, identity } =
    useStageEditorForm();
  const { committedFields, access } = useStageEdit();
  const stagedCodebook = useStagedCodebookStore();
  const localization = useProtocolLocalization();
  const { interfaceText } = useProtocolContext();
  const { withoutProposal } = useStandingStageNameProposal();
  const editing = access === 'editing';

  return useMemo(() => {
    if (committedFields === undefined) return undefined;

    const read = (): StageDraft => {
      const draft = liveDraft();
      const words = pendingSharedWording();
      const codebook = stagedCodebook?.read() ?? NOTHING_STAGED;
      // A shared word a save would write is the researcher's to lose where it
      // differs from what the protocol shows for it: their change to a word
      // it holds, or their own wording for one the stage is the first to use.
      const reworded =
        localization !== undefined &&
        words.some(
          ({ group, key, value }) =>
            !isEqual(
              value,
              standingSharedWord({ interfaceText, localization }, group, key),
            ),
        );
      return {
        stage: stageDocument(identity, draft),
        interfaceText: words,
        codebook,
        unsaved:
          reworded ||
          Object.keys(codebook).length > 0 ||
          !isEqualDeep(
            withoutAbsent(
              withoutProposal(stageFieldsOf(draft), committedFields),
            ),
            withoutAbsent(committedFields),
          ),
        editing,
      };
    };

    // Kept for the form state it was read from: the form's store hands out a
    // new state object on every change and the same one otherwise.
    let readFrom: unknown;
    let snapshot: StageDraft | undefined;
    return {
      subscribe: (listener) => storeApi.subscribe(listener),
      getSnapshot: () => {
        const state = storeApi.getState();
        if (snapshot === undefined || state !== readFrom) {
          snapshot = read();
          readFrom = state;
        }
        return snapshot;
      },
    };
  }, [
    committedFields,
    editing,
    identity,
    interfaceText,
    liveDraft,
    localization,
    pendingSharedWording,
    stagedCodebook,
    storeApi,
    withoutProposal,
  ]);
}

/**
 * What a document is compared as, on both sides.
 *
 * A field that is mounted and empty and a field that is not mounted at all are
 * the same thing to a researcher, and the form says the first as an absent
 * value and the second by not being there — so both sides drop absent values
 * and the empty containers that leaves behind. Clearing a field that had a
 * committed value still reads as unsaved: the key survives on the committed
 * side only.
 *
 * Narrower than `withoutAbsentValues`, which also drops what a cleared control
 * submits (an empty string, `NaN`): that is a rule about what a save may
 * write, and an empty string the researcher typed over a value is still a
 * change to it.
 */
function withoutAbsent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAbsent);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const kept = withoutAbsent(entry);
    if (
      kept !== null &&
      typeof kept === 'object' &&
      !Array.isArray(kept) &&
      Object.keys(kept).length === 0
    ) {
      continue;
    }
    result[key] = kept;
  }
  return result;
}
