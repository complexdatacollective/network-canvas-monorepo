import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { INPUT_OPTIONS, getVariableTypeLabel } from '~/config/variables';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

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
        type: renderStrong,
        control: renderStrong,
      })}
    </span>
  );
};

export default AttributeControlDescription;
