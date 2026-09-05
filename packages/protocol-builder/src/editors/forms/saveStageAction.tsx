import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActionContext } from '../../form/StageEditorShell.tsx';

/**
 * The control that saves the stage, for an editor reached through the
 * dispatcher.
 *
 * The shell keeps a slot for action chrome because a host composing it
 * directly puts its own buttons there. A NAMED editor is not composed that
 * way: the dispatcher hands it a controller and a stage type and nothing else,
 * so the only thing that can put a control on the form the editor just built
 * is the editor. A host that wants different chrome around a stage editor
 * builds it from `StageEditorShell` rather than from the dispatcher.
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
