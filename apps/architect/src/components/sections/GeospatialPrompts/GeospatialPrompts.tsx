import { useMemo, type ComponentType } from 'react';

import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import type { CrossClassPick } from '~/components/Validations/crossClassPicks';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import { useCrossClassEditorValidate } from '../useCrossClassEditorValidate';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';

type Prompt = Record<string, unknown>;

/**
 * Cross-class exclusivity gate: the geospatial selection is an UNVALIDATED
 * writer, so its variable may not be one a form elsewhere already collects
 * (the save-time backstop for a stale draft that bypassed the picker
 * exclusion — see the shared withVariableOptions' excludeValidatedUses call).
 */
const PROMPT_PICKS = [
  { path: 'variable', writerClass: 'unvalidated' },
] as const satisfies readonly CrossClassPick[];

const isSubjectEntity = (
  value: string | undefined,
): value is 'node' | 'edge' | 'ego' =>
  value === 'node' || value === 'edge' || value === 'ego';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

// Deliberately NOT `StageEditorSectionProps & {...}`: `withDisabledSubjectRequired`
// only ever supplies `{interfaceType?, type?}` (own) and `{disabled,
// disabledMessage}` (injected) — the component it wraps must accept exactly
// that shape (or less) for the composition below to typecheck. `stagePath`/
// `stagePosition` pass through unread (the section doesn't need them).
type GeospatialPromptsProps = {
  disabled?: boolean;
  disabledMessage?: string;
};

const GeospatialPrompts = ({
  disabled,
  disabledMessage,
}: GeospatialPromptsProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  const subject = useMemo(
    () => (isSubjectEntity(entity) && type ? { entity, type } : null),
    [entity, type],
  );
  const editorValidate = useCrossClassEditorValidate({
    picks: PROMPT_PICKS,
    subjectForRow: () => subject,
  });

  return (
    <Section
      disabled={disabled}
      disabledMessage={disabledMessage}
      layout="vertical"
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        hint="Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable handles on the left hand side."
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        validation={{ notEmpty }}
        initialValue={initialPrompts}
        addTitle="Edit Prompt"
        previewComponent={
          PromptPreview as ComponentType<Record<string, unknown>>
        }
        editorFieldsComponent={
          PromptFields as ComponentType<Record<string, unknown>>
        }
        editorTitle="Edit Prompt"
        itemLabel="prompt"
        editorDialogSize="editor"
        editorProps={{ entity, type }}
        editorValidate={editorValidate}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

const GeospatialPromptsWithDisabledState =
  withDisabledSubjectRequired(GeospatialPrompts);

/**
 * `withDisabledSubjectRequired` computes `disabled`/`disabledMessage` from
 * `interfaceType`/`type` props (the `withSubject` enhancer used to inject
 * `type`). Sections no longer receive `type` as a prop — it comes from
 * `useSubject()` — so this forwards it explicitly rather than composing the
 * two enhancers as before.
 */
const GeospatialPromptsSection = (props: StageEditorSectionProps) => {
  const { type } = useSubject();
  return (
    <GeospatialPromptsWithDisabledState {...props} type={type ?? undefined} />
  );
};

export default GeospatialPromptsSection;
