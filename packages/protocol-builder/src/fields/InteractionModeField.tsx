import { type ComponentProps, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';

import { binBehavioursMessages } from '../sections/bin-behaviours/binBehavioursMessages.ts';

type InteractionMode = 'drag' | 'select';

export type InteractionModeFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'options'
> &
  Readonly<{
    value?: InteractionMode;
    onChange?: (value: InteractionMode) => void;
  }>;

/**
 * How the participant places nodes in bins. An absent value is drag and drop,
 * which is what every bin stage did before the choice existed.
 */
export default function InteractionModeField({
  value,
  onChange,
  ...props
}: InteractionModeFieldProps) {
  const intl = useAppIntl();
  // Held for as long as the reader's language does not change: a control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const options = useMemo<RichSelectOption[]>(
    () => [
      {
        value: 'drag',
        label: intl.formatMessage(binBehavioursMessages.dragLabel),
        description: intl.formatMessage(binBehavioursMessages.dragDescription),
      },
      {
        value: 'select',
        label: intl.formatMessage(binBehavioursMessages.selectLabel),
        description: intl.formatMessage(
          binBehavioursMessages.selectDescription,
        ),
      },
    ],
    [intl],
  );

  return (
    <RichSelectGroupField
      {...props}
      options={options}
      value={value ?? 'drag'}
      onChange={(next) => onChange?.(next === 'select' ? 'select' : 'drag')}
    />
  );
}
