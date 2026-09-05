import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActionContext } from '../stage-editor-contract.ts';

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
  return (
    <div className="flex justify-end">
      <SubmitButton form={formId}>Save stage</SubmitButton>
    </div>
  );
}
