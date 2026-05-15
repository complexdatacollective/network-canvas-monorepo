/* eslint-disable react/jsx-props-no-spreading */

import { useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { cx } from '~/utils/cva';

import MarkdownLabel from './MarkdownLabel';

type RadioProps = {
  label?: React.ReactNode;
  fieldLabel?: string;
  className?: string;
  disabled?: boolean;
  input: {
    name?: string;
    value?: unknown;
    onChange?: (value: unknown) => void;
    [key: string]: unknown;
  };
} & Record<string, unknown>;

const Radio = ({
  label,
  className = '',
  input,
  disabled = false,
  fieldLabel,
  ...rest
}: RadioProps) => {
  const id = useRef(uuid());

  const { name, value, onChange, ...inputRest } = input;

  return (
    <label
      data-disabled={disabled || undefined}
      htmlFor={id.current}
      className={cx(
        'group relative mb-(--space-md) inline-flex cursor-pointer items-center last:mb-0',
        'data-[disabled]:pointer-events-none data-[disabled]:cursor-default',
        className,
      )}
    >
      <input
        type="radio"
        id={id.current}
        name={name}
        // input.checked is only provided by redux form if type="checkbox" or type="radio" is
        // provided to <Field />, so for the case that it isn't we can rely on the more reliable
        // input.value
        checked={!!value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.(e.target.checked)
        }
        className="peer absolute opacity-0"
        {...(inputRest as Record<string, unknown>)}
        {...(rest as Record<string, unknown>)}
      />
      <div
        className={cx(
          'relative mr-(--space-sm) inline-block size-(--space-xl) shrink-0',
          "before:border-border before:absolute before:inset-0 before:rounded-full before:border-2 before:border-solid before:content-['']",
          'before:transition-[border-color] before:duration-(--animation-duration-standard) before:ease-(--animation-easing)',
          "after:absolute after:inset-1.5 after:content-['']",
          'after:bg-input-active after:rounded-full after:opacity-0',
          'after:transition-opacity after:duration-(--animation-duration-standard) after:ease-(--animation-easing)',
          'peer-checked:before:border-input-active peer-checked:after:opacity-100',
          'group-data-[disabled]:before:border-surface-2 group-data-[disabled]:after:opacity-0',
        )}
      />
      {label &&
        (typeof label === 'string' ? (
          <MarkdownLabel
            inline
            label={label}
            className="[&>:first-child]:mt-0 [&>:last-child]:mb-0"
          />
        ) : (
          <div className="size-(--space-2xl)">{label}</div>
        ))}
    </label>
  );
};

export default Radio;
