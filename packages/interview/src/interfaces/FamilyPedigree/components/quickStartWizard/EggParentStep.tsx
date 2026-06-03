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
      <Paragraph>
        Please answer the following questions about your egg parent. This is the
        person who contributed the egg that you were conceived with, which may
        be different from the person who carried you during pregnancy.
      </Paragraph>
      <hr />
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
          inline
        />
        <Field
          name="gestationalCarrier"
          label="Did this parent carry you during pregnancy?"
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
