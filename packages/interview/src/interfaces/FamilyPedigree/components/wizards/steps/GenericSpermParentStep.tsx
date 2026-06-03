'use client';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

export default function GenericSpermParentStep() {
  const nodeType = useStageSelector(getNodeType);
  const nodeForm = useStageSelector(getNodeForm);

  const { fieldComponents } = useProtocolForm({
    subject: {
      entity: 'node',
      type: nodeType,
    },
    fields: nodeForm ?? [],
  });

  return (
    <FieldNamespace prefix="sperm-parent">
      <Alert variant="info">
        <AlertDescription>
          The sperm parent is the person who contributed the sperm that this
          person was conceived with.
        </AlertDescription>
      </Alert>
      <Field
        name="name"
        label="What is their name?"
        component={InputField}
        hint="Leave blank if the name is not known"
      />
      <Field
        name="is-donor"
        label="Was this person a sperm donor?"
        component={BooleanField}
        initialValue={false}
        required
      />
      {fieldComponents}
    </FieldNamespace>
  );
}
