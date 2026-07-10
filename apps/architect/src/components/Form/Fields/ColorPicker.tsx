import { range } from 'es-toolkit';
import { TriangleAlert } from 'lucide-react';

import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

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
  // range() is end-exclusive, so run to paletteRange + 1 — otherwise the
  // palette's last colour can never be picked.
  const colors = palette
    ? range(1, paletteRange + 1).map((index) =>
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
        'mr-2.5 mb-2.5 size-[60px] rounded-[60px]',
        'transition-colors duration-300 ease-in-out',
        "after:m-[4px] after:rounded-[60px] after:content-['']",
        'after:size-[52px]',
        'after:border-2 after:border-transparent after:bg-(--color)',
        'after:transition-colors after:duration-300 after:ease-in-out',
        input.value === color.value && 'bg-selected after:border-surface-1',
      )}
      onClick={() => handleClick(color.value)}
      aria-label={`Select color ${color.label}`}
      style={
        { '--color': resolveProtocolColor(color.value) } as React.CSSProperties
      }
      key={color.value}
    >
      <div className="hidden">{color.label}</div>
    </button>
  );

  const showError = invalid && touched && error;

  return (
    <div className="m-0 [&>h4]:m-0">
      <div>
        {label && (
          <div
            className={headingVariants({
              level: 'h4',
              margin: 'none',
              className: 'text-text mt-10 mb-5 font-semibold',
            })}
          >
            {label}
          </div>
        )}
        <div
          className={cx(
            'bg-surface-1 text-input-contrast rounded-t-sm pt-2.5 pl-2.5',
            showError && 'border-destructive border-[0.3rem]',
          )}
        >
          <div className="flex flex-wrap">{colors.map(renderColor)}</div>
        </div>
        {showError && (
          <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-1 [&_svg]:max-h-5">
            <TriangleAlert aria-hidden />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ColorPicker;
