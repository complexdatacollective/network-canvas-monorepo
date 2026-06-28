import { get } from 'es-toolkit/compat';
import { compose } from 'react-recompose';
import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import EditableList from '~/components/EditableList';
import { Row, Section } from '~/components/EditorLayout';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { RootState } from '~/ducks/modules/root';

import EntitySelectField from '../fields/EntitySelectField/EntitySelectField';
import FieldFields from '../Form/FieldFields';
import FieldPreview from '../Form/FieldPreview';
import { itemSelector, normalizeField } from '../Form/helpers';
import withFormHandlers from '../Form/withFormHandlers';

type EdgeFormFieldsInnerProps = {
  form: string;
  entity: string;
  type: string;
  handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
};

const EdgeFormFieldsInner = ({
  form,
  entity,
  type,
  handleChangeFields,
}: EdgeFormFieldsInnerProps) => (
  <Section
    group
    title="Edge attributes"
    summary={
      <p>
        These fields collect attributes about each edge of this type, shown when
        the participant inspects the connection.
      </p>
    }
  >
    <EditableList
      fieldName="form.fields"
      form={form}
      editFormName="edge-form-field-edit"
      title="Edit Field"
      editComponent={FieldFields}
      previewComponent={FieldPreview}
      editProps={{ entity, type }}
      normalize={(value: unknown) =>
        normalizeField(value as Record<string, unknown>)
      }
      itemSelector={
        itemSelector(entity, type) as (
          state: Record<string, unknown>,
          params: { form: string; editField: string },
        ) => unknown
      }
      onChange={(value: unknown) =>
        handleChangeFields(value as Array<Record<string, unknown>>)
      }
    />
  </Section>
);

const EdgeFormFields = compose<
  EdgeFormFieldsInnerProps,
  { form: string; entity: string; type: string }
>(withFormHandlers)(EdgeFormFieldsInner);

type EdgeFieldsProps = {
  id?: string;
  subject?: { type?: string; entity?: string };
  form: string;
};

const EdgeFields = ({ form }: EdgeFieldsProps) => {
  const subject = useSelector((state: RootState) =>
    formValueSelector(form)(state, 'subject'),
  );
  const edgeType = (subject as { type?: string } | undefined)?.type ?? null;

  return (
    <>
      <Section title="Edge Type">
        <Row>
          <IssueAnchor fieldName="subject" description="Edge Type" />
          <ValidatedField
            name="subject"
            entityType="edge"
            component={EntitySelectField}
            parse={(value) => ({ type: value, entity: 'edge' })}
            format={(value) => get(value, 'type')}
            validation={{ required: true }}
          />
        </Row>
      </Section>
      {edgeType ? (
        <EdgeFormFields form={form} entity="edge" type={edgeType} />
      ) : (
        <Section title="Edge attributes">
          <p>Select an edge type to configure its attributes.</p>
        </Section>
      )}
    </>
  );
};

export default EdgeFields;
