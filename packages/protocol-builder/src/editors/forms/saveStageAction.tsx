import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActionContext } from '../../stage-editor-contract.ts';

/**
 * The control that saves the stage, when the host supplied none of its own.
 *
 * Every named editor takes the host's action chrome and hands it to the shell,
 * so a host composing the dispatcher puts its own buttons on the form this
 * family built. A host that passes nothing — and the package's own tests and
 * stories, which mount an editor to exercise it rather than to wrap it — would
 * otherwise be left with a form and no way to submit it, so this is what the
 * slot falls back to.
 *
 * Disabled while the session is read-only, which is chrome rather than the
 * guarantee: the shell refuses the write itself, and says why, for every other
 * way a form can still be submitted.
 */
export function saveStageAction({
  formId,
  readOnly,
}: StageEditorActionContext) {
  return (
    <div className="flex justify-end">
      <SubmitButton form={formId} disabled={readOnly}>
        Save stage
      </SubmitButton>
    </div>
  );
}
