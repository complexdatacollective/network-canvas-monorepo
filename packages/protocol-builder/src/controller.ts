import { useId, useMemo, useRef, useSyncExternalStore } from 'react';

import { canonicalize, type Command } from '@codaco/studio-sync/apply';

import type {
  ProtocolBuilderResourceGateway,
  ResourceResult,
} from './resources/gateway.ts';
import {
  commandsFromDraftChange,
  type CompoundEditRequest,
  type CompoundEditResult,
  type ProtocolBuilderSession,
  type ProtocolBuilderSnapshot,
  type ProtocolBuilderValidation,
  type StageFormDraft,
} from './session.ts';

/**
 * Builds the next draft from the one the session holds right now.
 *
 * Deliberately not "a replacement draft". A caller assembling one from the
 * snapshot it rendered against is a revision behind by the time a submit runs,
 * and diffing that against the session's current fields would emit commands
 * reverting everything that arrived in between. Being handed the current draft
 * makes the safe thing the only thing a caller can write.
 */
export type StageFormDraftChange = (current: StageFormDraft) => StageFormDraft;

export type StageEditorController = Readonly<{
  formId: string;
  snapshot: ProtocolBuilderSnapshot;
  /**
   * The session's resource gateway, or `undefined` when the host opened the
   * session without one. The shell provides it to the editor's resource
   * pickers; they reach it through `useResourceGateway`, never through this.
   */
  resourceGateway: ProtocolBuilderResourceGateway | undefined;
  changeFields(next: StageFormDraftChange): void;
  setField(key: string, value: unknown): void;
  unsetField(key: string): void;
  insertItem(key: string, index: number, item: unknown): void;
  removeItem(key: string, index: number): void;
  moveItem(key: string, from: number, to: number): void;
  /**
   * Issues commands a list editor has already decided on, and answers with the
   * draft they produced.
   *
   * `changeFields` diffs a whole draft, so everything it can say about a list
   * is `set` — which loses WHICH row was inserted, removed or moved, the one
   * thing a collaborator's client needs to replay the edit onto a list that has
   * since changed. A list editor therefore says what it did. It is handed the
   * resulting draft because it also owns a control bound to that list, and
   * reading the value back out of a snapshot it was memoised on would leave the
   * control a revision behind its own edit.
   */
  applyCommands(commands: readonly Command[]): StageFormDraft;
  undo(): void;
  redo(): void;
  validate(): Promise<ProtocolBuilderValidation>;
  requestCompoundEdit(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult>;
  finish(): Promise<void>;
  /** Closes the editor without finishing: staged resources are discarded. */
  cancel(): Promise<ResourceResult<undefined>>;
  /**
   * Whether this draft is the one one of THIS form's own writes produced,
   * spending the record if it is.
   *
   * The form's controls are written to rather than rebuilt when the draft
   * moves for a reason that is not the form itself (see `reseedStageForm`),
   * and every write above moves it. So each of them records the draft it
   * produced, and the shell asks here before deciding an arrival is a
   * surprise. Left unasked, choosing something whose only consequence reaches
   * the session — a reset, a row operation, a submit — would write the agreed
   * draft back over every control on screen, including the one the researcher
   * has just moved.
   *
   * The record describes ONE write and is spent by the transition it explains:
   * undo and then redo returns the draft to the same content, by which time
   * the controls are showing the undone values, and a record left standing
   * would leave them there to be saved back over the redo.
   */
  takeOwnWrite(content: string): boolean;
  /**
   * Forgets a recorded own write, because the transition it explained is not
   * going to happen — a submit whose finish was refused, most of all.
   */
  forgetOwnWrite(): void;
}>;

export function useStageEditorController(
  session: ProtocolBuilderSession,
  requestedFormId?: string,
): StageEditorController {
  const generatedFormId = useId();
  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getSnapshot(),
    () => session.getServerSnapshot(),
  );
  const formId = requestedFormId ?? `protocol-builder-${generatedFormId}`;
  // Outlives every memo below: what the form last wrote is a fact about the
  // session, not about the render that happened to write it.
  const ownWrite = useRef<string | null>(null);

  return useMemo(() => {
    /**
     * Runs one of the form's own writes and records the draft it produced.
     *
     * Both readings are taken from the SESSION rather than from the snapshot
     * this controller was memoised on, which is a revision behind anything
     * that arrived since — and stale by a whole write when a handler makes two
     * in a row.
     *
     * A write that moves nothing records nothing: it has no transition to
     * explain, and a record left standing would be spent on some later arrival
     * at the same content — a redo, most likely — leaving the controls showing
     * what was undone.
     */
    const own = <T>(write: () => T): T => {
      const before = canonicalize(session.getSnapshot().editedSection.fields);
      const result = write();
      const after = canonicalize(session.getSnapshot().editedSection.fields);
      if (after !== before) ownWrite.current = after;
      return result;
    };

    return {
      formId,
      snapshot,
      resourceGateway: session.getResourceGateway(),
      changeFields(update: StageFormDraftChange) {
        own(() => {
          // Both the draft handed out and the diff baseline are what the
          // session holds NOW, not the snapshot this controller was memoised
          // on, so a change acknowledged since the last render is neither
          // re-sent nor reverted.
          const current = session.getSnapshot().editedSection.fields;
          session.dispatch(commandsFromDraftChange(current, update(current)));
        });
      },
      setField(key: string, value: unknown) {
        const command: Command =
          value === undefined
            ? { op: 'unset', key }
            : { op: 'set', key, value };
        own(() => session.dispatch([command]));
      },
      unsetField(key: string) {
        own(() => session.dispatch([{ op: 'unset', key }]));
      },
      insertItem(key: string, index: number, item: unknown) {
        own(() => session.dispatch([{ op: 'insertItem', key, index, item }]));
      },
      removeItem(key: string, index: number) {
        own(() => session.dispatch([{ op: 'removeItem', key, index }]));
      },
      moveItem(key: string, from: number, to: number) {
        own(() => session.dispatch([{ op: 'moveItem', key, from, to }]));
      },
      applyCommands(commands: readonly Command[]) {
        // An empty batch is how a list editor READS the draft the session
        // holds right now, which is the point of asking rather than reading
        // the snapshot it rendered against. It writes nothing, so `own` finds
        // nothing moved and records nothing — including in the tick an arrival
        // lands, where the read is answered with the arrival's own content.
        return own(() => {
          if (commands.length > 0) session.dispatch(commands);
          // Read from the session rather than from `snapshot`, for the same
          // reason `changeFields` does: what this controller was memoised on
          // is a revision behind anything that arrived since.
          return session.getSnapshot().editedSection.fields;
        });
      },
      // Deliberately NOT own writes, which is the whole distinction the record
      // exists to make: an undo or a redo moves the draft out from under the
      // controls, and a form left showing what was undone saves it back over
      // the undo.
      undo: () => session.undo(),
      redo: () => session.redo(),
      validate: () => session.validate(),
      // Also not an own write. What comes back is the HOST's decision about
      // sections this form does not own, and the stage document it answers
      // with is an authoritative replacement — exactly what the re-seed is
      // for.
      requestCompoundEdit: (request: CompoundEditRequest) =>
        session.requestCompoundEdit(request),
      finish: () => session.finish(),
      cancel: () => session.cancel(),
      takeOwnWrite(content: string) {
        if (ownWrite.current !== content) return false;
        ownWrite.current = null;
        return true;
      },
      forgetOwnWrite() {
        ownWrite.current = null;
      },
    };
  }, [formId, session, snapshot]);
}
