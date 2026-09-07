import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { INPUT_OPTIONS, getVariableTypeLabel } from '~/config/variables';

const messages = defineMessages({
  description: {
    id: 'architect.form.attributeControlDescription',
    defaultMessage:
      '<type>{typeLabel}</type> attribute using <control>{controlLabel}</control> input control',
    description:
      'Whole description in field-preview badges. Type and control tags emphasize translated metadata labels; the stable protocol identifiers are unchanged.',
  },
});

/** Shared by ordinary, composer, and family-pedigree field-preview badges. */
const AttributeControlDescription = ({
  type,
  component,
}: {
  type?: string;
  component?: string;
}) => {
  const intl = useAppIntl();
  const controlDescriptor = INPUT_OPTIONS.find(
    (option) => option.value === component,
  )?.label;
  return (
    <span>
      {intl.formatMessage(messages.description, {
        typeLabel: getVariableTypeLabel(type, intl),
        controlLabel: controlDescriptor
          ? intl.formatMessage(controlDescriptor)
          : (component ?? ''),
        type: (children) => <strong>{children}</strong>,
        control: (children) => <strong>{children}</strong>,
      })}
    </span>
  );
};

export default AttributeControlDescription;
