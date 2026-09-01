'use client';

import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FramingId } from '@codaco/protocol-validation';

import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import usePedigreeNodeForm from '../../hooks/usePedigreeNodeForm';
import PersonNameField from '../PersonNameField';

// "Gestational Carrier" is framing-invariant, but the explanatory body must not
// leak gamete wording under the gendered framing — mirror EggParentStep/
// SpermParentStep and branch the whole sentence.
const INTRO_COPY: Record<FramingId, string> = {
  gamete:
    'Please answer the following questions about your gestational carrier. This is the person who carried you during pregnancy but did not contribute the egg, including gestational surrogates.',
  gendered:
    'Please answer the following questions about your gestational carrier. This is the person who carried you during pregnancy but is not your biological mother, including gestational surrogates.',
};

export default function GestationalCarrierStep() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <>
      <Paragraph>{INTRO_COPY[framingKey]}</Paragraph>
      <hr />
      <FieldNamespace prefix="gestational-carrier">
        <PersonNameField
          label="What is their name?"
          hint="Leave blank if the name is not known"
          autoFocus
        />
        {fieldComponents}
      </FieldNamespace>
    </>
  );
}
