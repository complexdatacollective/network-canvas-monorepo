'use client';

import InputField from '../../form/fields/InputField';
import { type TextFilterConfig } from './types';

type TextFilterProps = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  config: TextFilterConfig;
};

export default function TextFilter({
  value,
  onChange,
  config,
}: TextFilterProps) {
  return (
    <InputField
      type="text"
      name="text-filter"
      size="sm"
      value={value ?? ''}
      placeholder={config.placeholder}
      onChange={(next) => {
        const trimmed = (next ?? '').trim();
        onChange(trimmed.length === 0 ? undefined : trimmed);
      }}
    />
  );
}
