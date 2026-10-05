'use client';

import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import usePedigreeNodeForm from '../../../hooks/usePedigreeNodeForm';
import { messages } from '../../../messages';
import PersonNameField from '../../PersonNameField';

function AdditionalParentFields({ index }: { index: number }) {
  const intl = useAppIntl();
  const PARENT_ROLE_OPTIONS = [
    {
      value: 'step-parent',
      label: intl.formatMessage(messages.stepParentRole),
    },
    {
      value: 'adoptive-parent',
      label: intl.formatMessage(messages.adoptiveParentRole),
    },
    {
      value: 'raised-them',
      label: intl.formatMessage(messages.raisedThemRole),
    },
  ];

  const { fieldComponents } = usePedigreeNodeForm();

  return (
    <Surface spacing="sm" shadow="sm">
      <FieldNamespace prefix={`additional-parent[${String(index)}]`}>
        <Heading level="h3">
          <AppMessage
            message={messages.additionalParentNumber}
            values={{ number: index + 1 }}
          />
        </Heading>
        <Field
          name="role"
          label={intl.formatMessage(messages.parentRole)}
          component={RadioGroupField}
          options={PARENT_ROLE_OPTIONS}
          required
        />
        <PersonNameField
          label={intl.formatMessage(messages.whatName)}
          autoFocus
        />
        {fieldComponents}
      </FieldNamespace>
    </Surface>
  );
}

export default function GenericAdditionalParentsStep() {
  const { otherParentCount } = useFormValue(['otherParentCount']);
  const count = Number(otherParentCount ?? 0);

  return (
    <>
      <Paragraph>
        <AppMessage message={messages.otherAdditionalParentsIntro} />
      </Paragraph>
      <div className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <AdditionalParentFields key={i} index={i} />
        ))}
      </div>
    </>
  );
}
