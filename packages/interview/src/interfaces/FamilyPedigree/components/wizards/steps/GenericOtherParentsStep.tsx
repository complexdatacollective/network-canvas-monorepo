'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { messages } from '../../../messages';

export default function GenericOtherParentsStep() {
  const intl = useAppIntl();
  return (
    <>
      <Field
        label={intl.formatMessage(messages.otherAdditionalParents)}
        hint={intl.formatMessage(messages.otherAdditionalParentsHint)}
        name="hasOtherParents"
        component={BooleanField}
        required
      />
      <FieldGroup
        watch={['hasOtherParents']}
        condition={(values) => values.hasOtherParents === true}
      >
        <Field
          label={intl.formatMessage(messages.otherAdditionalParentsCount)}
          name="otherParentCount"
          component={InputField}
          type="number"
          min={1}
          initialValue="1"
          autoFocus
          required
        />
      </FieldGroup>
    </>
  );
}
