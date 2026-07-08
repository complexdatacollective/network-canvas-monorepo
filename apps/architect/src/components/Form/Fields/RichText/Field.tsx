import type React from 'react';
import { useRef } from 'react';
import { v4 as uuid } from 'uuid';

import MarkdownLabel from '~/components/Form/Fields/MarkdownLabel';
import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import RichText from './RichText';

type RichTextFieldProps = {
  input: {
    value: string;
    onChange: (value: string) => void;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
  };
  meta?: {
    error?: string;
    active?: boolean;
    invalid?: boolean;
    touched?: boolean;
  };
  label?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  inline?: boolean;
  disallowedTypes?: string[];
  className?: string | null;
};

const RichTextField = ({
  input,
  meta = {},
  label = null,
  placeholder,
  autoFocus = false,
  inline = false,
  disallowedTypes = [],
  className = null,
}: RichTextFieldProps) => {
  const _id = useRef(uuid());

  const anyLabel = label;
  const hasError = !!(meta.invalid && meta.touched && meta.error);

  return (
    <div className="m-0 w-full [&>h4]:m-0">
      {anyLabel && (
        <h4>
          <MarkdownLabel label={anyLabel} />
        </h4>
      )}
      <div className={cx(className)}>
        <RichText
          value={input.value}
          onChange={input.onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          inline={inline}
          disallowedTypes={disallowedTypes}
          hasError={hasError}
        />
        {hasError && (
          <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
            <Icon name="warning" />
            {meta.error}
          </div>
        )}
      </div>
    </div>
  );
};

export default RichTextField;
