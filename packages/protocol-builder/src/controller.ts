import { useId, useMemo, useSyncExternalStore } from 'react';

import type { Command } from '@codaco/studio-sync/apply';

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
 * A replacement draft, or a function handed the draft the session holds right
 * now. Prefer the function: a form assembles its next draft from the current
 * one, and the snapshot a component rendered against can be a revision behind
 * by the time a submit runs.
 */
export type StageFormDraftChange =
  | StageFormDraft
  | ((current: StageFormDraft) => StageFormDraft);

export type StageEditorController = Readonly<{
  formId: string;
  snapshot: ProtocolBuilderSnapshot;
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
      changeFields(next: StageFormDraftChange) {
        // Diffed against what the session holds now, not against the snapshot
        // this controller was memoised on: a change acknowledged between the
        // last render and this call would otherwise be re-sent as a local
        // command that overwrites it.
        const current = session.getSnapshot().editedSection.fields;
        const resolved = typeof next === 'function' ? next(current) : next;
        session.dispatch(commandsFromDraftChange(current, resolved));
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
    }),
    [formId, session, snapshot],
  );
}
