'use client';

import { forwardRef } from 'react';

import Toggle, { type ToggleProps } from '../../Toggle';
import type { CreateFormFieldProps } from '../Field/types';
import { useFormFeedback } from '../FormFeedbackListener';

export type ToggleFieldProps = CreateFormFieldProps<
  boolean,
  'button',
  Pick<ToggleProps, 'size'>
>;

const ToggleField = forwardRef<HTMLButtonElement, ToggleFieldProps>(
  (props, ref) => {
    const { value = false, onChange, ...toggleProps } = props;
    const { onOptionToggle } = useFormFeedback();

    return (
      <Toggle
        {...toggleProps}
        ref={ref}
        checked={value}
        // Called only for the person's own switch, never for a value the
        // program sets.
        onCheckedChange={(checked) => {
          onChange?.(checked);
          onOptionToggle(checked);
        }}
      />
    );
  },
);

ToggleField.displayName = 'ToggleField';

export default ToggleField;
