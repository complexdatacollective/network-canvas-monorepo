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

export default function GenericGestationalCarrierStep() {
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
    <FieldNamespace prefix="gestational-carrier">
      <Alert variant="info">
        <AlertDescription>
          The gestational carrier is the person who carried them during
          pregnancy but did not contribute the egg.
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
        label="Was this person a gestational surrogate?"
        component={BooleanField}
        required
      />
      {fieldComponents}
    </FieldNamespace>
  );
}
