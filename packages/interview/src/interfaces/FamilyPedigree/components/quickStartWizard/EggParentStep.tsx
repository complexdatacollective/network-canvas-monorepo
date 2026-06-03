'use client';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

export default function EggParentStep() {
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
        <Field
          name="name"
          label="What is their name?"
          component={InputField}
          hint="Leave blank if the name is not known"
        />
        <Field
          name="is-donor"
          label="Was this person an egg donor?"
          component={BooleanField}
          initialValue={false}
          required
        />
        <Field
          name="gestationalCarrier"
          label="Did this parent carry you during pregnancy?"
          hint="If you were carried by a different person (e.g. a gestational carrier or surrogate), select 'No' here and we'll ask you about the carrier below."
          component={BooleanField}
          initialValue={true}
          required
        />
        {fieldComponents}
      </FieldNamespace>
      <FieldGroup
        watch={['egg-parent.gestationalCarrier']}
        condition={(values) =>
          values['egg-parent.gestationalCarrier'] === false
        }
      >
        <Surface level={1} spacing="sm" shadow="sm">
          <FieldNamespace prefix="gestational-carrier">
            <div className="mb-8">
              <Heading level="h3">Gestational Carrier</Heading>
              <Alert variant="info">
                <AlertDescription>
                  The gestational carrier is the person who carried you during
                  pregnancy but did not contribute the egg. This includes
                  gestational surrogates.
                </AlertDescription>
              </Alert>
            </div>
            <Field
              name="is-donor"
              label="Was this person a gestational surrogate?"
              component={BooleanField}
              required
            />
            <Field
              name="name"
              label="What is their name?"
              component={InputField}
              hint="Leave blank if the name is not known"
            />
            {fieldComponents}
          </FieldNamespace>
        </Surface>
      </FieldGroup>
    </>
  );
}
