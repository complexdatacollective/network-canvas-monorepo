'use client';

import CheckboxGroupField from '../../form/fields/CheckboxGroup';
import { type BooleanFilterConfig } from './types';

type BooleanFilterProps = {
  'value': boolean | undefined;
  'onChange': (value: boolean | undefined) => void;
  'config': BooleanFilterConfig;
  /** The id of the visible label naming what is filtered. */
  'aria-labelledby'?: string;
};

export default function BooleanFilter({
  value,
  onChange,
  config,
  'aria-labelledby': ariaLabelledBy,
}: BooleanFilterProps) {
  const options = [
    { value: 'true', label: config.trueLabel },
    { value: 'false', label: config.falseLabel },
  ];

  const selected: string[] = [];
  if (value === true) selected.push('true');
  if (value === false) selected.push('false');

  const handleChange = (values: (string | number)[] | undefined) => {
    const stringValues = (values ?? []).map(String);
    const hasTrue = stringValues.includes('true');
    const hasFalse = stringValues.includes('false');

    if (hasTrue && hasFalse) {
      // Both selected = no filter
      onChange(undefined);
    } else if (hasTrue) {
      onChange(true);
    } else if (hasFalse) {
      onChange(false);
    } else {
      onChange(undefined);
    }
  };

  return (
    <CheckboxGroupField
      name="boolean-filter"
      aria-labelledby={ariaLabelledBy}
      options={options}
      value={selected}
      onChange={handleChange}
      orientation="horizontal"
      size="sm"
    />
  );
}
