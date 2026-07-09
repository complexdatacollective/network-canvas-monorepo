import { TriangleAlert } from 'lucide-react';
/* eslint-disable react/jsx-props-no-spreading */
import { memo, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { cx } from '~/utils/cva';

import MarkdownLabel from './MarkdownLabel';

type TextInputProps = {
  input?: {
    name?: string;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
    [key: string]: unknown;
  };
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  label?: string | null;
  placeholder?: string | number;
  fieldLabel?: string | null;
  className?: string;
  variant?: 'default' | 'embedded';
  type?: 'text' | 'number' | 'search';
  autoFocus?: boolean;
  hidden?: boolean;
  adornmentLeft?: React.ReactNode;
  adornmentRight?: React.ReactNode;
};

const TextInput = ({
  input = {},
  meta = {},
  label = null,
  placeholder = 'Enter some text...',
  fieldLabel = null,
  className = '',
  variant = 'default',
  type = 'text',
  autoFocus = false,
  hidden = false,
  adornmentLeft = null,
  adornmentRight = null,
}: TextInputProps) => {
  const { error, invalid, touched } = meta;
  const id = useRef(uuid());
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount when requested (e.g. the variable spotlight search) so the
  // user can type immediately. A ref/effect is used instead of the native
  // `autoFocus` attribute to focus reliably after a dialog's focus trap settles.
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const hasLeftAdornment = !!adornmentLeft;
  const hasRightAdornment = !!adornmentRight;
  const hasError = !!(invalid && touched && error);

  const anyLabel = fieldLabel || label;

  return (
    <div className="m-0 w-full [&>h4]:m-0" hidden={hidden}>
      {anyLabel && (
        <h4>
          <MarkdownLabel label={anyLabel} />
        </h4>
      )}
      <div className={cx('group relative', className)}>
        <input
          ref={inputRef}
          id={id.current}
          name={input.name}
          className={cx(
            'form-field placeholder:italic',
            'group-hover:border-b-input-active focus:border-b-input-active',
            hasLeftAdornment && 'pl-[3.25em]',
            hasRightAdornment && 'pr-[3.25em]',
            hasError && 'border-destructive rounded-b-none border-2',
            variant === 'embedded' && 'm-0 rounded border-0 pb-2.5',
          )}
          placeholder={placeholder?.toString()}
          type={type}
          {...input}
        />
        {adornmentLeft && (
          <div className="absolute inset-y-0 left-[1em] flex w-[1.5em] items-center justify-center transition-all duration-150 ease-in-out">
            {adornmentLeft}
          </div>
        )}
        {adornmentRight && (
          <div className="absolute inset-y-0 right-[1em] flex w-[1.5em] items-center justify-center transition-all duration-150 ease-in-out">
            {adornmentRight}
          </div>
        )}
        {hasError && (
          <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
            <TriangleAlert aria-hidden />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(TextInput);
