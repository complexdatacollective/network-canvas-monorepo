'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

export default function GestationalCarrierStep() {
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
      <Paragraph>
        Please answer the following questions about your gestational carrier.
        This is the person who carried you during pregnancy but did not
        contribute the egg, including gestational surrogates.
      </Paragraph>
      <hr />
      <FieldNamespace prefix="gestational-carrier">
        <Field
          name="name"
          label="What is their name?"
          component={InputField}
          hint="Leave blank if the name is not known"
          autoFocus
        />
        {fieldComponents}
      </FieldNamespace>
    </>
  );
}
