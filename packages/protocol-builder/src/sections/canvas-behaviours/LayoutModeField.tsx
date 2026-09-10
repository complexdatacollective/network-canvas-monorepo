import { type ComponentProps, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';

import { canvasBehavioursMessages } from './canvasBehavioursMessages.ts';

const MANUAL = 'manual';
const AUTOMATIC = 'automatic';

export type LayoutModeFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'options'
> &
  Readonly<{
    value?: boolean;
    onChange?: (value: boolean) => void;
  }>;

/**
 * How the stage arranges nodes when it opens.
 *
 * Stored as a boolean, chosen as one of two named modes: "automatic layout is
 * off" is not something a researcher recognises as a decision, while "manual
 * mode" is, and each card can then say what the participant will actually see.
 */
export default function LayoutModeField({
  value,
  onChange,
  ...props
}: LayoutModeFieldProps) {
  const intl = useAppIntl();
  // Held for as long as the reader's language does not change: a control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const options = useMemo<RichSelectOption[]>(
    () => [
      {
        value: MANUAL,
        label: intl.formatMessage(
          canvasBehavioursMessages.layoutModeManualLabel,
        ),
        description: intl.formatMessage(
          canvasBehavioursMessages.layoutModeManualDescription,
        ),
      },
      {
        value: AUTOMATIC,
        label: intl.formatMessage(
          canvasBehavioursMessages.layoutModeAutomaticLabel,
        ),
        description: intl.formatMessage(
          canvasBehavioursMessages.layoutModeAutomaticDescription,
        ),
      },
    ],
    [intl],
  );

  return (
    <RichSelectGroupField
      {...props}
      options={options}
      value={value === true ? AUTOMATIC : MANUAL}
      onChange={(next) => onChange?.(next === AUTOMATIC)}
    />
  );
}
