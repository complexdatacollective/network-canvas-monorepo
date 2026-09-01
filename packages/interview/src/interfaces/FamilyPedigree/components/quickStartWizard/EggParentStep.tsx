'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FramingId } from '@codaco/protocol-validation';

import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import { FRAMING_TERMS } from '../../framingTerms';
import usePedigreeNodeForm from '../../hooks/usePedigreeNodeForm';
import PersonNameField from '../PersonNameField';

const INTRO_COPY: Record<FramingId, string> = {
  gamete:
    'Please answer the following questions about your egg parent. This is the person who contributed the egg that you were conceived with, which may be different from the person who carried you during pregnancy.',
  gendered:
    'Please answer the following questions about your mother. This is your biological mother, who may be different from the person who carried you during pregnancy.',
};

export default function EggParentStep() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';
  const terms = FRAMING_TERMS[framingKey];

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <>
      <Paragraph>{INTRO_COPY[framingKey]}</Paragraph>
      <hr />
      <FieldNamespace prefix="egg-parent">
        <PersonNameField
          label="What is their name?"
          hint="Leave blank if the name is not known"
          autoFocus
        />
        <Field
          name="is-donor"
          label={terms.eggDonorQuestion}
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
