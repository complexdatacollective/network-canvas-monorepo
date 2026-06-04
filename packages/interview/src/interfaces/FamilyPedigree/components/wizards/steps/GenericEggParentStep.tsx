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

export default function GenericEggParentStep() {
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
    <>
      <FieldNamespace prefix="egg-parent">
        <Alert variant="info">
          <AlertDescription>
            The egg parent is the person who contributed the egg that this
            person was conceived with.
          </AlertDescription>
        </Alert>
        <Field
          name="name"
          label="What is their name?"
          component={InputField}
          hint="Leave blank if the name is not known"
          autoFocus
        />
        <Field
          name="is-donor"
          label="Was this person an egg donor?"
          component={BooleanField}
          initialValue={false}
          required
          inline
        />
        <Field
          name="gestationalCarrier"
          label="Did this parent carry them during pregnancy?"
          component={BooleanField}
          initialValue={true}
          required
          inline
        />
        {fieldComponents}
      </FieldNamespace>
    </>
  );
}
