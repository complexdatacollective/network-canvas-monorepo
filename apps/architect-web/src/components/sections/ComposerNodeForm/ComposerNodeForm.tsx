import { compose } from 'react-recompose';

import EditableList from '~/components/EditableList';
import { Section } from '~/components/EditorLayout';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import FieldFields from '../Form/FieldFields';
import FieldPreview from '../Form/FieldPreview';
import { itemSelector, normalizeField } from '../Form/helpers';
import withFormHandlers from '../Form/withFormHandlers';

type ComposerNodeFormProps = StageEditorSectionProps & {
  handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
  type?: string | null;
  entity?: string | null;
  disabled?: boolean;
  disabledMessage?: string;
};

export const ComposerNodeFormComponent = ({
  handleChangeFields,
  form,
  disabled = false,
  disabledMessage,
  type = null,
  entity = null,
}: ComposerNodeFormProps) => (
  <Section
    disabled={disabled}
    disabledMessage={disabledMessage}
    group
    title="Node attributes"
    summary={
      <p>
        These fields collect attributes about each node, shown in the node
        inspector panel.
      </p>
    }
  >
    <EditableList
      editComponent={FieldFields}
      editProps={{
        type,
        entity,
      }}
      previewComponent={FieldPreview}
      fieldName="nodeForm.fields"
      title="Edit Field"
      onChange={(value: unknown) =>
        handleChangeFields(value as Array<Record<string, unknown>>)
      }
      normalize={(value: unknown) =>
        normalizeField(value as Record<string, unknown>)
      }
      itemSelector={
        itemSelector(entity, type) as (
          state: Record<string, unknown>,
          params: { form: string; editField: string },
        ) => unknown
      }
      form={form}
    />
  </Section>
);

export default compose<ComposerNodeFormProps, StageEditorSectionProps>(
  withSubject,
  withFormHandlers,
  withDisabledSubjectRequired,
)(ComposerNodeFormComponent);
