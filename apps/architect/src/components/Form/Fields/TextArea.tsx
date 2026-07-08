/* eslint-disable react/jsx-props-no-spreading */

import { useRef } from 'react';
import { v4 as uuid } from 'uuid';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import MarkdownLabel from './MarkdownLabel';

type TextAreaProps = {
  input?: {
    name?: string;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    [key: string]: unknown;
  };
  meta?: {
    active?: boolean;
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  label?: string | null;
  fieldLabel?: string | null;
  className?: string;
  variant?: 'default' | 'embedded';
  placeholder?: string;
  hidden?: boolean;
};

const TextArea = ({
  input = {},
  meta = {},
  label = null,
  fieldLabel = null,
  className = '',
  variant = 'default',
  placeholder = '',
  hidden = false,
}: TextAreaProps) => {
  const id = useRef(uuid());

  const { error, invalid, touched } = meta;
  const hasError = !!(invalid && touched && error);

  return (
    <label
      htmlFor={id.current}
      className="m-0 block w-full [&>h4]:m-0"
      hidden={hidden}
    >
      {(fieldLabel || label) && (
        <MarkdownLabel label={fieldLabel || label || ''} />
      )}
      <div className={cx('group relative', className)}>
        <textarea
          id={id.current}
          className={cx(
            'form-field block resize-y placeholder:italic',
            'group-hover:border-b-input-active focus:border-b-input-active',
            hasError && 'border-destructive rounded-b-none border-2',
            variant === 'embedded' && 'm-0 rounded border-0 pb-2.5',
          )}
          placeholder={placeholder}
          {...input}
        />
        {hasError && (
          <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
            <Icon name="warning" />
            {error}
          </div>
        )}
      </div>
    </label>
  );
};

export default TextArea;
