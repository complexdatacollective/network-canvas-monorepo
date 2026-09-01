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
    'Please answer the following questions about your sperm parent. This is the person who contributed the sperm that you were conceived with.',
  gendered:
    'Please answer the following questions about your father. This is your biological father.',
};

export default function SpermParentStep() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';
  const terms = FRAMING_TERMS[framingKey];

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <>
      <Paragraph>{INTRO_COPY[framingKey]}</Paragraph>
      <hr />
      <FieldNamespace prefix="sperm-parent">
        <PersonNameField
          label="What is their name?"
          hint="Leave blank if the name is not known"
          autoFocus
        />
        <Field
          name="is-donor"
          label={terms.spermDonorQuestion}
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
