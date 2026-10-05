'use client';

import { forwardRef } from 'react';

import Toggle, { type ToggleProps } from '../../Toggle';
import type { CreateFormFieldProps } from '../Field/types';

export type ToggleFieldProps = CreateFormFieldProps<
  boolean,
  'button',
  Pick<ToggleProps, 'size'>
>;

const ToggleField = forwardRef<HTMLButtonElement, ToggleFieldProps>(
  (props, ref) => {
    const { value = false, onChange, ...toggleProps } = props;

    return (
      <Toggle
        {...toggleProps}
        ref={ref}
        checked={value}
        onCheckedChange={onChange}
      />
    );
  },
);

ToggleField.displayName = 'ToggleField';

export default ToggleField;
