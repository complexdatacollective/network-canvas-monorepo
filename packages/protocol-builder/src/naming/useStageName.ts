import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
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
   * Write it, exactly as typing into the control would.
   *
   * Refused while somebody else holds the stage, and said out loud in the
   * form's own error region rather than silently: a spectator's host may still
   * offer a rename, and a write that vanished would look like a save that
   * worked.
   */
  setValue: (value: string) => void;
  /** What a control naming the field calls it, in the reader's language. */
  label: string;
  /**
   * Whether this stage is being created rather than opened.
   *
   * Reported rather than acted on. Naming the stage is the first thing there
   * is to do in a stage that does not exist yet, and an existing stage was
   * opened to be looked at rather than renamed — but whether that means the
   * name takes focus is a question about the whole page the editor is on, and
   * only the host can answer it. Architect's route focus deliberately leaves a
   * destination that has already claimed focus alone, which is the other half
   * of that arrangement.
   */
  isNewStage: boolean;
  /**
   * What this stage would be called if nobody had named it, recomputed as the
   * stage is configured.
   *
   * Offered for every stage, named or not, so a host can put "suggest a name"
   * in front of a researcher whenever it wants to. Whether it is ever written
   * WITHOUT being asked is `useAutoStageName`, which a host opts into.
   */
  proposal: string;
  /** Write the proposal as the name, and count it as this editor's doing. */
  acceptProposal: () => void;
}>;

/**
 * The stage's name: what it is, how to change it, and what this editor would
 * call the stage if nobody had.
 *
 * Callable anywhere inside the editor, and as many times as a host likes — a
 * title, a rename dialog, a breadcrumb. It holds the field's registration but
 * draws nothing from it, which is the difference between this and
 * `useStageNameField`: that one binds a CONTROL to the name, so one control
 * means one caller.
 *
 * Deliberately not a component: what a stage title LOOKS like is host chrome —
 * Architect draws a picture of the interface with the name written across it,
 * and a host with a stage list may want a rename dialog and no title at all —
 * while what the name IS, and whose name is on the stage, is protocol
 * semantics and belongs here.
 *
 * Takes nothing. Everything it needs is already in the editor it is called
 * inside: the stage form holds the draft a name is derived from, the open edit
 * says whether the stage is being created, and `protocolContext` carries the
 * codebook, the asset manifest and the stage order. A host that had to
 * assemble any of that could assemble it differently from the editor beside
 * it.
 *
 * It registers the name for the same reason it can be called anywhere: a
 * submit keeps only the paths the form has a field at, so a host that draws no
 * control and renames from a menu would otherwise write into a form the save
 * then ignored — and watch the rename disappear with nothing said about it.
 */
export function useStageName(): StageName {
  const { creation } = useStageEditorForm();
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
    isNewStage: creation !== undefined,
    proposal,
    acceptProposal,
  };
}
