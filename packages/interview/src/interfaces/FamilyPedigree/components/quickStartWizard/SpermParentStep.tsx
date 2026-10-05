'use client';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import { getFramingTerms } from '../../framingTerms';
import usePedigreeNodeForm from '../../hooks/usePedigreeNodeForm';
import { messages } from '../../messages';
import PersonNameField from '../PersonNameField';

const INTRO_COPY = {
  gamete: messages.spermIntro,
  gendered: messages.fatherIntro,
};

export default function SpermParentStep() {
  const intl = useAppIntl();
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const framingKey = framing ?? 'gamete';
  const terms = getFramingTerms(framingKey, intl);

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <>
      <Paragraph>
        <AppMessage message={INTRO_COPY[framingKey]} />
      </Paragraph>
      <hr />
      <FieldNamespace prefix="sperm-parent">
        <PersonNameField
          label={intl.formatMessage(messages.whatName)}
          hint={intl.formatMessage(messages.unknownNameHint)}
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
