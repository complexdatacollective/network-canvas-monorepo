'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { messages } from '../../messages';
import PersonFields from './PersonFields';

export default function PartnerAndChildrenStep() {
  const intl = useAppIntl();
  return (
    <>
      <Field
        label={intl.formatMessage(messages.currentPartnerQuestion)}
        name="hasPartner"
        component={BooleanField}
        required
      />
      <FieldGroup
        watch={['hasPartner']}
        condition={(values) => values.hasPartner === true}
      >
        <PersonFields namespace="partner" />
        <Field
          label={intl.formatMessage(messages.childrenWithPartnerCount)}
          name="childrenWithPartnerCount"
          component={InputField}
          type="number"
          min={0}
          initialValue="0"
          required
        />
      </FieldGroup>
    </>
  );
}
