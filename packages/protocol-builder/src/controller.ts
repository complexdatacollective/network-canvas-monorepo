import { useId, useMemo, useSyncExternalStore } from 'react';

import type { Command } from '@codaco/studio-sync/apply';

import type { ResourceResult } from './resources/gateway.ts';
import type { SessionResourceGateway } from './resources/lifecycle.ts';
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
  resourceGateway: SessionResourceGateway | undefined;
  changeFields(next: StageFormDraftChange): void;
  setField(key: string, value: unknown): void;
  unsetField(key: string): void;
  insertItem(key: string, index: number, item: unknown): void;
  removeItem(key: string, index: number): void;
  moveItem(key: string, from: number, to: number): void;
  undo(): void;
  redo(): void;
  validate(): Promise<ProtocolBuilderValidation>;
  requestCompoundEdit(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult>;
  finish(): Promise<void>;
  /** Closes the editor without finishing: staged resources are discarded. */
  cancel(): Promise<ResourceResult<undefined>>;
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

  return useMemo(
    () => ({
      formId,
      snapshot,
      resourceGateway: session.getResourceGateway(),
      changeFields(update: StageFormDraftChange) {
        // Both the draft handed out and the diff baseline are what the session
        // holds NOW, not the snapshot this controller was memoised on, so a
        // change acknowledged since the last render is neither re-sent nor
        // reverted.
        const current = session.getSnapshot().editedSection.fields;
        session.dispatch(commandsFromDraftChange(current, update(current)));
      },
      setField(key: string, value: unknown) {
        const command: Command =
          value === undefined
            ? { op: 'unset', key }
            : { op: 'set', key, value };
        session.dispatch([command]);
      },
      unsetField(key: string) {
        session.dispatch([{ op: 'unset', key }]);
      },
      insertItem(key: string, index: number, item: unknown) {
        session.dispatch([{ op: 'insertItem', key, index, item }]);
      },
      removeItem(key: string, index: number) {
        session.dispatch([{ op: 'removeItem', key, index }]);
      },
      moveItem(key: string, from: number, to: number) {
        session.dispatch([{ op: 'moveItem', key, from, to }]);
      },
      undo: () => session.undo(),
      redo: () => session.redo(),
      validate: () => session.validate(),
      requestCompoundEdit: (request: CompoundEditRequest) =>
        session.requestCompoundEdit(request),
      finish: () => session.finish(),
      cancel: () => session.cancel(),
    }),
    [formId, session, snapshot],
  );
}
