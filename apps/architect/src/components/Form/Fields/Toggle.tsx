import { isBoolean } from 'es-toolkit/compat';
import { useEffect, useId } from 'react';

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
  const labelId = useId();

  return (
    <div className="m-0 [&>h4]:m-0">
      {fieldLabel && <MarkdownLabel label={fieldLabel} />}
      {/* Native <label> wrap: clicking the label toggles base-ui's hidden
          input (its span onClick preventDefaults, so there is no double toggle),
          and aria-labelledby gives the switch its accessible name. */}
      <label
        className={cx(
          'flex flex-row items-center justify-start gap-5',
          !disabled && 'cursor-pointer',
          className,
        )}
        title={title}
      >
        <Switch
          name={name}
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          className={cx(
            'shrink-0',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        />
        {label && (
          <span
            id={labelId}
            className="[&>:first-child]:mt-0 [&>:last-child]:mb-0"
          >
            <MarkdownLabel inline label={label} />
          </span>
        )}
      </label>
      {hasError && (
        <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default Toggle;
