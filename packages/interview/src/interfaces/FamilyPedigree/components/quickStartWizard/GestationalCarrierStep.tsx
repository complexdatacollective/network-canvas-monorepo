'use client';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import usePedigreeNodeForm from '../../hooks/usePedigreeNodeForm';
import { messages } from '../../messages';
import PersonNameField from '../PersonNameField';

// "Gestational Carrier" is framing-invariant, but the explanatory body must not
// leak gamete wording under the gendered framing — mirror EggParentStep/
// SpermParentStep and branch the whole sentence.
const INTRO_COPY = {
  gamete: messages.carrierGameteIntro,
  gendered: messages.carrierGenderedIntro,
};

export default function GestationalCarrierStep() {
  const intl = useAppIntl();
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <>
      <Paragraph>
        <AppMessage message={INTRO_COPY[framingKey]} />
      </Paragraph>
      <hr />
      <FieldNamespace prefix="gestational-carrier">
        <PersonNameField
          label={intl.formatMessage(messages.whatName)}
          hint={intl.formatMessage(messages.unknownNameHint)}
          autoFocus
        />
        {fieldComponents}
      </FieldNamespace>
    </>
  );
}
