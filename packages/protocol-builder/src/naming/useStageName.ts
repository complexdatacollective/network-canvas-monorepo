import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import {
  stageNameMessages,
  useLiveStageLabel,
  useProposedStageLabel,
  useStageNameRegistration,
  useStageNameWriter,
} from './stageNameInternals.ts';

export type StageName = Readonly<{
  /** The name as the form holds it right now. */
  value: string;
  /**
   * Write it, exactly as typing into the control would. Refused out loud while
   * somebody else holds the stage: a write that vanished would look to the
   * researcher like one that worked.
   */
  setValue: (value: string) => void;
  /** What a control naming the field calls it, in the reader's language. */
  label: string;
  /**
   * What this stage would be called if nobody had named it, recomputed as the
   * stage is configured. Offered for every stage, named or not; whether it is
   * ever written unasked is `useAutoStageName`.
   */
  proposal: string;
  /** Write the proposal as the name, and count it as this editor's doing. */
  acceptProposal: () => void;
}>;

/**
 * The stage's name: what it is, how to change it, and what this editor would
 * call the stage if nobody had.
 *
 * Callable anywhere in the editor and as many times as a host likes. It holds
 * the field's registration but draws nothing from it — `useStageNameField`
 * binds a CONTROL, so one control means one caller of that.
 *
 * It registers for the same reason it may be called anywhere: a submit keeps
 * only the paths the form has a field at, so a host that draws no control and
 * renames from a menu would otherwise be writing into a form the save ignores.
 *
 * Takes nothing — the stage form holds the draft, the open edit says whether
 * the stage is being created, and `protocolContext` carries the codebook, the
 * assets and the stage order.
 */
export function useStageName(): StageName {
  const intl = useAppIntl();
  useStageNameRegistration();
  const value = useLiveStageLabel();
  const proposal = useProposedStageLabel();
  const write = useStageNameWriter();

  const setValue = useCallback(
    (next: string) => {
      write(next, 'chosen');
    },
    [write],
  );

  const acceptProposal = useCallback(() => {
    write(proposal, 'proposed');
  }, [proposal, write]);

  return {
    value,
    setValue,
    label: intl.formatMessage(stageNameMessages.stageName),
    proposal,
    acceptProposal,
  };
}
