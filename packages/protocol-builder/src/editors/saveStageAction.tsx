import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActionContext } from '../stage-editor-contract.ts';

/**
 * Exported for the test harness, which stands in for this control on the path
 * that mounts sections without an editor around them: a stand-in that named
 * itself would put a second spelling of the same words into the package, and —
 * because it would be a literal — an ENGLISH one, which the locale sweeps then
 * find on a Spanish surface and report against whichever section was open.
 */
export const saveStageMessages = defineMessages({
  saveStage: {
    id: 'protocolBuilder.shell.saveStage',
    defaultMessage: 'Save stage',
    description:
      'Action that saves the step of the interview a researcher is editing. Names the stage rather than saying only "Save", because a host may show its own controls beside this one.',
  },
});

/**
 * The control that saves the stage, when the host supplied none of its own.
 *
 * Every named editor takes the host's action chrome and hands it to the shell,
 * so a host composing the dispatcher puts its own buttons on the form this
 * package built. A host that passes nothing — and the package's own tests and
 * stories, which mount an editor to exercise it rather than to wrap it — would
 * otherwise be left with a form and no way to submit it, so this is what the
 * slot falls back to.
 *
 * One control for every family, above both of them, because which family an
 * interface belongs to is not a reason for a save button to behave
 * differently: a researcher who has learnt what pressing it does on one stage
 * has learnt it for all of them.
 *
 * Deliberately NOT disabled while the session is read-only. Every control
 * above it already is, so the state is on screen; a spectator who presses this
 * anyway is asking a question, and the shell answers it with the reason the
 * stage cannot be saved and what to do about it, which a disabled button says
 * to nobody. It is also the only honest state: access can be taken away
 * between the render that read it and the submit itself, so the shell's own
 * refusal is the guarantee either way.
 */
export function saveStageAction({ formId }: StageEditorActionContext) {
  return <SaveStageAction formId={formId} />;
}

/**
 * A component rather than the markup inline, because the words are formatted
 * through the reader's own provider and `saveStageAction` is called as a plain
 * function by the shell's action slot rather than rendered as an element.
 */
function SaveStageAction({ formId }: Readonly<{ formId: string }>) {
  const intl = useAppIntl();

  return (
    <div className="flex justify-end">
      <SubmitButton form={formId}>
        {intl.formatMessage(saveStageMessages.saveStage)}
      </SubmitButton>
    </div>
  );
}
