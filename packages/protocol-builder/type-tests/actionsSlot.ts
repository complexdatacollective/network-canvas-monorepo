import type {
  StageEditorActionContext,
  StageEditorActions,
  StageEditorComponent,
  StageEditorProps,
} from '../src/stage-editor-contract.ts';

/** Stands in for the shell, which takes the same slot the editor was given. */
declare function shell(actions?: StageEditorActions): null;

/**
 * MUST COMPILE: the action slot is part of every named editor's contract, and
 * an editor that ignores it is still a named editor.
 *
 * The registry renders whatever a host gave it, which may be no chrome at all,
 * so an editor that never mentions the slot has to stay assignable — and one
 * that forwards it has to be able to hand exactly what it was given to the
 * shell, without widening or narrowing it on the way.
 */
export const IgnoresTheSlot: StageEditorComponent<'Information'> = () => null;

export const ForwardsTheSlot: StageEditorComponent<'Information'> = (
  props: StageEditorProps<'Information'>,
) => shell(props.actions);

/**
 * What a host writes into the slot. The form id is the whole contract for a
 * submit control rendered outside the form, and `readOnly` is how chrome says
 * a spectator cannot use it.
 */
export const chrome: StageEditorActions = ({
  formId,
  readOnly,
}: StageEditorActionContext) => `${formId}:${String(readOnly)}`;
