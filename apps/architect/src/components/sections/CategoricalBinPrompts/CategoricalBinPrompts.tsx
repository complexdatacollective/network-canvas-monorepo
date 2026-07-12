import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import { PromptPreview } from '../NameGeneratorPrompts';
import { itemSelector, normalizeField } from './helpers';
import PromptFields from './PromptFields';
import withPromptChangeHandler from './withPromptChangeHandler';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
type CategoricalBinPromptsProps = StageEditorSectionProps & {
  handleChangePrompt: (value: unknown) => unknown;
  entity?: string | null;
  type?: string | null;
  disabled?: boolean;
  disabledMessage?: string;
};
const CategoricalBinPrompts = ({
  handleChangePrompt,
  entity = null,
  type = null,
  disabled,
  disabledMessage,
}: CategoricalBinPromptsProps) => (
  <Section
    disabled={disabled}
    disabledMessage={disabledMessage}
    summary={
      <Paragraph>
        Add one or more prompts below to frame the task for the user. You can
        reorder the prompts using the draggable handles on the left hand side.
      </Paragraph>
    }
    title="Prompts"
  >
    <ValidatedFieldArray
      name="prompts"
      label="Prompts"
      component={DialogArrayField}
      validation={{ notEmpty }}
      componentProps={{
        addTitle: 'Edit Prompt',
        previewComponent: PromptPreview,
        editorFieldsComponent: PromptFields,
        editorTitle: 'Edit Prompt',
        itemLabel: 'prompt',
        onBeforeSave: handleChangePrompt,
        normalizeItem: (value: unknown) =>
          isRecord(value) ? normalizeField(value) : value,
        itemSelector: itemSelector(entity, type),
        editorProps: { entity, type },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<CategoricalBinPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
  withPromptChangeHandler,
)(CategoricalBinPrompts);
