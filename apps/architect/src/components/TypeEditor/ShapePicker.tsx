import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import { type ConfigMessage, formatConfig } from '~/i18n/formatConfig';
import { cx } from '~/utils/cva';
const remainingMessages = defineMessages({
  selectShape: {
    id: 'architect.remaining.typeEditor.shapePicker.selectShape',
    defaultMessage: 'Select shape {value1}',
    description: 'The ariaLabel text in components / TypeEditor / ShapePicker.',
  },
});
const configMessages = defineMessages({
  circle: {
    id: 'architect.typeEditor.shapePicker.config.circle',
    defaultMessage: 'Circle',
    description:
      'Presentation label or description in components/TypeEditor/ShapePicker.tsx. Identifiers are not translated.',
  },
  square: {
    id: 'architect.typeEditor.shapePicker.config.square',
    defaultMessage: 'Square',
    description:
      'Presentation label or description in components/TypeEditor/ShapePicker.tsx. Identifiers are not translated.',
  },
  diamond: {
    id: 'architect.typeEditor.shapePicker.config.diamond',
    defaultMessage: 'Diamond',
    description:
      'Presentation label or description in components/TypeEditor/ShapePicker.tsx. Identifiers are not translated.',
  },
});

export const SHAPES: Array<{ value: NodeShape; label: ConfigMessage }> = [
  { value: 'circle', label: configMessages.circle },
  { value: 'square', label: configMessages.square },
  { value: 'diamond', label: configMessages.diamond },
];

const isNodeShape = (value: unknown): value is NodeShape =>
  SHAPES.some((shape) => shape.value === value);

type ShapePickerProps = CreateFormFieldProps<
  NodeShape,
  'fieldset',
  {
    /** Compact swatches for an inline mapping row (no labels, no chrome). */
    small?: boolean;
    nodeColor?: string;
    /** Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`. */
    required?: boolean;
  }
>;

/**
 * Node-shape swatch picker. Labelling belongs to the surrounding field — pass
 * it through `ArchitectField`'s `label`/`hint`, or `aria-label` when used
 * standalone inside a mapping row.
 */
export const ShapePickerControl = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  small = false,
  nodeColor = 'node-color-seq-1',
  disabled = false,
  readOnly = false,
  required = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: ShapePickerProps) => {
  const intl = useAppIntl();
  const nodeSize = small ? 'xs' : 'sm';

  return (
    <RadioGroup
      id={id}
      name={name}
      value={value ?? ''}
      onValueChange={(nextValue) => {
        if (!readOnly && isNodeShape(nextValue)) onChange?.(nextValue);
      }}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-label={ariaLabel}
      aria-labelledby={
        ariaLabel
          ? undefined
          : (ariaLabelledBy ?? (id ? `${id}-label` : undefined))
      }
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={ariaRequired || required || undefined}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx(
        'flex flex-wrap gap-3 rounded border-2',
        !small && 'bg-input text-input-contrast p-4',
        ariaInvalid && 'border-destructive',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
      )}
    >
      {formatConfig(SHAPES, intl).map((shape) => (
        <Radio.Root
          key={shape.value}
          value={shape.value}
          nativeButton
          render={(
            // Node's onDragStart/onDragEnd are pointer-based gesture props;
            // the HTML5 drag-event handlers in the generic bag must not be
            // spread into them.
            { onDrag, onDragStart, onDragEnd, ...renderProps },
            state,
          ) => (
            <Node
              {...renderProps}
              label={small ? '' : shape.label}
              ariaLabel={intl.formatMessage(remainingMessages.selectShape, {
                value1: shape.label,
              })}
              shape={shape.value}
              color={nodeColor as NodeColorSequence}
              size={nodeSize}
              selected={state.checked}
            />
          )}
        />
      ))}
    </RadioGroup>
  );
};
