import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorShellProps } from '../../form/StageEditorShell.tsx';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

/**
 * What a named stage editor takes: the registry's own contract, plus the
 * host's action chrome.
 *
 * The shell owns the form and knows whether it can be submitted; the host owns
 * where the save button lives and what sits beside it, and reads the form id
 * from the slot. An editor that did not forward the slot would leave a host no
 * way to render a submit control at all — so the prop is part of every named
 * editor, and optional, because a spectator view needs no chrome.
 *
 * Optional is also what keeps these components assignable to
 * `StageEditorComponent<T>`: the registry renders them with the contract's two
 * props and nothing else.
 */
export type NamedStageEditorProps<T extends StageType> = StageEditorProps<T> &
  Readonly<{ actions?: StageEditorShellProps['actions'] }>;

/**
 * Where this stage sits in the interview, for the heading to say.
 *
 * Read from the ordered stages the session already derives rather than taken
 * as a prop: a host that could pass a different number could tell a researcher
 * they are editing stage 4 while the interview runs it seventh. A stage the
 * order does not contain is one being created, and has no position to show
 * until it exists — so it is `undefined` rather than guessed at.
 */
export function interviewPosition(
  context: ProtocolBuilderProtocolContext,
  stageId: string,
): Readonly<{ index: number; total: number }> | undefined {
  const index = context.orderedStages.findIndex(
    (stage) => stage.id === stageId,
  );
  return index === -1
    ? undefined
    : { index: index + 1, total: context.orderedStages.length };
}
