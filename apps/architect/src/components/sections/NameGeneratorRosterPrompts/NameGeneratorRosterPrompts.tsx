import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withMapFormToProps from '../../enhancers/withMapFormToProps';
import withSubject from '../../enhancers/withSubject';
import { PromptPreview } from '../NameGeneratorPrompts';
import PromptFields from '../NameGeneratorPrompts/PromptFields';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type NameGeneratorRosterPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
  dataSource?: string;
};
const NameGeneratorRosterPrompts = ({
  entity,
  type,
  disabled,
  disabledMessage,
  dataSource,
}: NameGeneratorRosterPromptsProps) => (
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
        editorFieldsComponent: PromptFields,
        previewComponent: PromptPreview,
        editorTitle: 'Edit Prompt',
        itemLabel: 'prompt',
        editorProps: { entity, type, dataSource },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<
  NameGeneratorRosterPromptsProps,
  StageEditorSectionProps
>(
  withSubject,
  withMapFormToProps('dataSource'),
  withDisabledSubjectRequired,
  withDisabledAssetRequired,
)(NameGeneratorRosterPrompts);
