import { useMemo, type ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
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
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.geospatialPrompts.geospatialPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.geospatialPrompts.geospatialPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.geospatialPrompts.geospatialPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.geospatialPrompts.geospatialPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
  prompts: {
    id: 'architect.sections.geospatialPrompts.geospatialPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.geospatialPrompts.geospatialPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / GeospatialPrompts / GeospatialPrompts.',
  },
});

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

// Deliberately NOT `StageEditorSectionProps & {...}`: `withDisabledSubjectRequired`
// only ever supplies `{interfaceType?, type?}` (own) and `{disabled,
// disabledMessage}` (injected) — the component it wraps must accept exactly
// that shape (or less) for the composition below to typecheck. `stagePath`/
// `stagePosition` pass through unread (the section doesn't need them).
type GeospatialPromptsProps = {
  disabled?: boolean;
  disabledMessage?: string;
};

const GeospatialPrompts = ({ disabled }: GeospatialPromptsProps) => {
  const intl = useAppIntl();
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
      title={intl.formatMessage(messages.promptCollection)}
      description={intl.formatMessage(messages.createAndReorderThePromptsShown)}
      disabled={disabled}
    >
      <ArchitectArrayField
        name="prompts"
        label={intl.formatMessage(messages.prompts)}
        hint={intl.formatMessage(messages.addAtLeastOnePromptAnd)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(additionalMessages.createNewPrompt)}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        initialValue={initialPrompts}
        addTitle={intl.formatMessage(remainingMessages.editPrompt)}
        previewComponent={
          PromptPreview as ComponentType<Record<string, unknown>>
        }
        editorFieldsComponent={
          PromptFields as ComponentType<Record<string, unknown>>
        }
        editorTitle={intl.formatMessage(remainingMessages.editPrompt)}
        itemLabelMessage={arrayItemMessages.prompt}
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
