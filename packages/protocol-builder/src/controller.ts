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

export type StageEditorController = Readonly<{
  formId: string;
  snapshot: ProtocolBuilderSnapshot;
  changeFields(next: StageFormDraft): void;
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
      changeFields(next: StageFormDraft) {
        session.dispatch(
          commandsFromDraftChange(snapshot.editedSection.fields, next),
        );
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
