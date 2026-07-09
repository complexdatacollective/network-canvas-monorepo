import { TriangleAlert } from 'lucide-react';
/* eslint-disable react/jsx-props-no-spreading */

import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import { cx } from '~/utils/cva';

import MarkdownLabel from './MarkdownLabel';

type BooleanValue = boolean | null | undefined;

type BooleanOption = {
  label: string;
  value: boolean;
  disabled?: boolean;
};

type BooleanFieldProps = {
  label?: string | null;
  fieldLabel?: string | null;
  noReset?: boolean;
  className?: string;
  input: {
    name: string;
    value: BooleanValue;
    onChange: (value: BooleanValue) => void;
  };
  disabled?: boolean;
  options?: BooleanOption[];
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
};

const BooleanField = ({
  label = null,
  fieldLabel = null,
  noReset = false,
  className = '',
  input,
  disabled = false,
  options = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ],
  meta = {},
}: BooleanFieldProps) => {
  const { error, invalid, touched } = meta;
  const hasError = !!(invalid && touched && error);

  const anyLabel = fieldLabel || label;

  return (
    <div className={cx('mb-10 [&>h4]:m-0', className)}>
      {anyLabel && <MarkdownLabel label={anyLabel} />}
      <div>
        <FrescoBooleanField
          options={options}
          value={input.value ?? undefined}
          onChange={(value) => input.onChange(value ?? null)}
          noReset={noReset}
          disabled={disabled}
          aria-invalid={hasError || undefined}
        />
        {hasError && (
          <div className="bg-destructive text-destructive-contrast mt-1 flex items-center gap-1 rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
            <TriangleAlert aria-hidden />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default BooleanField;
