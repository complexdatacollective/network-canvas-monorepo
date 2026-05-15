/* eslint-disable react/jsx-props-no-spreading */

import { compose } from 'react-recompose';

import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import EditableList from '../../EditableList';
import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';

type GeospatialPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};

const GeospatialPrompts = ({
  form,
  entity,
  type,
  disabled,
  disabledMessage,
}: GeospatialPromptsProps) => (
  <Section
    disabled={disabled}
    disabledMessage={disabledMessage}
    summary={
      <p>
        Add one or more prompts below to frame the task for the user. You can
        reorder the prompts using the draggable handles on the left hand side.
      </p>
    }
    title="Prompts"
  >
    <EditableList
      title="Edit Prompt"
      previewComponent={
        PromptPreview as React.ComponentType<Record<string, unknown>>
      }
      editComponent={PromptFields}
      form={form}
      editProps={{ entity, type }}
    />
  </Section>
);

export default compose<GeospatialPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
)(GeospatialPrompts);
