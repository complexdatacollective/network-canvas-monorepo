import { isBoolean } from 'es-toolkit/compat';
import { useEffect } from 'react';

import Switch from '~/components/NewComponents/Switch';
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
}: ToggleProps) => {
  // redux-form omits an untouched field's value, so default it to `false`.
  useEffect(() => {
    if (!isBoolean(input.value)) {
      input.onChange(false);
    }
  }, [input]);

  const { error, invalid, touched } = meta;
  const hasError = !!(invalid && touched && error);

  const { name, value, onChange } = input;

  return (
    <div className="m-0 [&>h4]:m-0">
      {fieldLabel && <MarkdownLabel label={fieldLabel} />}
      <div
        className={cx(
          'flex flex-row items-center justify-start gap-(--space-md)',
          className,
        )}
        title={title}
      >
        <Switch
          name={name}
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
          disabled={disabled}
          className={cx(
            'shrink-0',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        />
        {label && (
          <MarkdownLabel
            inline
            label={label}
            className="[&>:first-child]:mt-0 [&>:last-child]:mb-0"
          />
        )}
      </div>
      {hasError && (
        <div className="bg-error text-error-foreground flex items-center rounded-b-sm px-(--space-xs) py-(--space-sm) [&_svg]:max-h-(--space-md)">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default Toggle;
