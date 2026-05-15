/* eslint-disable react/jsx-props-no-spreading */

import { isBoolean } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import MarkdownLabel from './MarkdownLabel';

type ToggleProps = {
  label?: string | null;
  title?: string;
  fieldLabel?: string | null;
  className?: string;
  disabled?: boolean;
  input: {
    name?: string;
    value?: unknown;
    onChange: (value: boolean) => void;
    [key: string]: unknown;
  };
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  [key: string]: unknown;
};

const Toggle = ({
  label = null,
  title = '',
  fieldLabel = null,
  className = '',
  disabled = false,
  input,
  meta = {},
  ...rest
}: ToggleProps) => {
  const id = useRef(uuid());

  // Because redux forms will just not pass on this
  // field if it was never touched and we need it to
  // return `false`.
  useEffect(() => {
    if (!isBoolean(input.value)) {
      input.onChange(false);
    }
  }, [input]);

  const { error, invalid, touched } = meta;
  const hasError = !!(invalid && touched && error);

  const { name, value, onChange, ...inputRest } = input;

  return (
    <div className="form-field-container">
      {fieldLabel && <MarkdownLabel label={fieldLabel} />}
      <label
        className={cx(
          'form-field flex cursor-pointer flex-row items-center justify-start',
          className,
        )}
        htmlFor={id.current}
        title={title}
      >
        <input
          className="hidden"
          id={id.current}
          name={name}
          checked={!!value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.checked)
          }
          disabled={disabled}
          type="checkbox"
          value="true"
          {...(inputRest as Record<string, unknown>)}
          {...(rest as Record<string, unknown>)}
        />
        <div className="relative mr-(--space-md) inline-block h-(--space-xl) w-(--space-3xl)">
          <span
            data-state={value ? 'checked' : 'unchecked'}
            className={cx(
              'absolute inset-0 overflow-hidden',
              'bg-primary rounded-(--space-xl)',
              'transition-colors duration-(--animation-duration-fast) ease-(--animation-easing)',
              'data-[state=checked]:bg-active',
              'before:absolute before:top-0 before:left-0',
              "before:rounded-full before:content-['']",
              'before:bg-border before:size-(--space-xl)',
              'before:transition-[left] before:duration-(--animation-duration-fast) before:ease-(--animation-easing)',
              'data-[state=checked]:before:left-[calc(100%-var(--space-xl))]',
              disabled && 'opacity-50',
            )}
          />
        </div>
        {label && (
          <MarkdownLabel
            inline
            label={label}
            className="[&>:first-child]:mt-0 [&>:last-child]:mb-0"
          />
        )}
      </label>
      {hasError && (
        <div className="bg-error text-foreground flex items-center px-(--space-xs) py-(--space-sm) [&_svg]:max-h-(--space-md)">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default Toggle;
