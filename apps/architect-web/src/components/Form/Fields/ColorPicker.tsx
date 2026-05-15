import { range } from 'es-toolkit';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

type ColorOption = {
  label: string;
  value: string;
};

type InputProps = {
  value: string;
  onChange: (value: string) => void;
};

type MetaProps = {
  error?: string;
  invalid?: boolean;
  touched?: boolean;
};

type ColorPickerProps = {
  palette?: string;
  paletteRange?: number;
  options?: ColorOption[];
  input: InputProps;
  label?: string;
  meta: MetaProps;
};

const asColorOption = (name: string): ColorOption => ({
  label: name,
  value: name,
});

const ColorPicker = ({
  palette,
  paletteRange = 0,
  options = [],
  input,
  label,
  meta: { error, invalid, touched },
}: ColorPickerProps) => {
  const colors = palette
    ? range(1, paletteRange).map((index) =>
        asColorOption(`${palette}-${index}`),
      )
    : options;

  const handleClick = (value: string) => {
    input.onChange(value);
  };

  const renderColor = (color: ColorOption) => (
    <button
      type="button"
      className={cx(
        'flex cursor-pointer items-center justify-center overflow-hidden',
        'mr-(--space-sm) mb-(--space-sm) size-(--picker-size) rounded-(--picker-size)',
        'transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)',
        "after:m-(--picker-border-size) after:rounded-(--picker-size) after:content-['']",
        'after:size-[calc(var(--picker-size)-var(--picker-border-size)*2)]',
        'after:border-2 after:border-transparent after:bg-(--color)',
        'after:transition-colors after:duration-(--animation-duration-standard) after:ease-(--animation-easing)',
        input.value === color.value && 'bg-selected after:border-surface-1',
      )}
      onClick={() => handleClick(color.value)}
      aria-label={`Select color ${color.label}`}
      style={{ '--color': `hsl(var(--${color.value}))` } as React.CSSProperties}
      key={color.value}
    >
      <div className="hidden">{color.label}</div>
    </button>
  );

  const showError = invalid && touched && error;

  return (
    <div className="form-field-container">
      <div>
        {label && (
          <div className="font-heading text-foreground mt-(--space-xl) mb-(--space-md) font-semibold">
            {label}
          </div>
        )}
        <div
          className={cx(
            'bg-surface-1 text-input-foreground rounded-t-sm pt-(--space-sm) pl-(--space-sm)',
            showError && 'border-error border-(length:--space-xs)',
          )}
        >
          <div className="flex flex-wrap">{colors.map(renderColor)}</div>
        </div>
        {showError && (
          <div className="bg-error text-error-foreground flex items-center rounded-b-sm px-(--space-xs) py-(--space-xs) [&_svg]:max-h-(--space-md)">
            <Icon name="warning" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ColorPicker;
