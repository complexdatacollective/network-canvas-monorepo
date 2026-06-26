'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_TERMS, type FramingId } from '@codaco/shared-consts';
import useProtocolForm from '~/forms/useProtocolForm';
import { useStageSelector } from '~/hooks/useStageSelector';
import { useFamilyPedigreeStore } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import {
  getNodeForm,
  getNodeType,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

const INTRO_COPY: Record<FramingId, string> = {
  gamete:
    'Please answer the following questions about your egg parent. This is the person who contributed the egg that you were conceived with, which may be different from the person who carried you during pregnancy.',
  gendered:
    'Please answer the following questions about your mother. This is the person who contributed the egg that you were conceived with, which may be different from the person who carried you during pregnancy.',
};

export default function EggParentStep() {
  const nodeType = useStageSelector(getNodeType);
  const nodeForm = useStageSelector(getNodeForm);
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';
  const terms = FRAMING_TERMS[framingKey];

  const { fieldComponents } = useProtocolForm({
    subject: {
      entity: 'node',
      type: nodeType,
    },
    fields: nodeForm ?? [],
  });

  return (
    <>
      <Paragraph>{INTRO_COPY[framingKey]}</Paragraph>
      <hr />
      <FieldNamespace prefix="egg-parent">
        <Field
          name="name"
          label="What is their name?"
          component={InputField}
          hint="Leave blank if the name is not known"
          autoFocus
        />
        <Field
          name="is-donor"
          label={`Was this person an ${terms.eggDonor.toLowerCase()}?`}
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
