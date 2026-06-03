'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

export default function SpermParentStep() {
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
        Please answer the following questions about your sperm parent. This is
        the person who contributed the sperm that you were conceived with.
      </Paragraph>
      <hr />
      <FieldNamespace prefix="sperm-parent">
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
          inline
        />
        {fieldComponents}
      </FieldNamespace>
    </>
  );
}
