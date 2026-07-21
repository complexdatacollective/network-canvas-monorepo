import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import type { ComponentType, FocusEventHandler } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import { cx } from '~/utils/cva';

export const SHAPES: Array<{ value: NodeShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
];

const isNodeShape = (value: unknown): value is NodeShape =>
  SHAPES.some((shape) => shape.value === value);

type ShapePickerControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: NodeShape;
  'onChange'?: (value: NodeShape) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'small'?: boolean;
  'nodeColor'?: string;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'required'?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-required'?: boolean;
};

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
}: ShapePickerControlProps) => {
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
        'flex flex-wrap gap-3 rounded border-2 border-transparent',
        !small && 'bg-input text-input-contrast p-4',
        ariaInvalid && 'border-destructive',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
      )}
    >
      {SHAPES.map((shape) => (
        <Radio.Root
          key={shape.value}
          value={shape.value}
          nativeButton
          render={(renderProps, state) => (
            <Node
              {...renderProps}
              label={small ? '' : shape.label}
              ariaLabel={`Select shape ${shape.label}`}
              shape={shape.value}
              color={nodeColor as NodeColorSequence}
              size={nodeSize}
              // Selection reads as the design-system focus ring in the node's
              // own colour (Node's colour variant sets `outline-node-N`), rather
              // than the generic `--selected` highlight. Unselected shapes sit at
              // reduced opacity and come forward on hover.
              className={cx(
                'transition-[opacity,outline] duration-150',
                state.checked
                  ? 'outline-2 outline-offset-3'
                  : 'opacity-70 hover:opacity-100',
              )}
            />
          )}
        />
      ))}
    </RadioGroup>
  );
};

type ShapePickerProps = WrappedFieldProps & {
  label?: string;
  small?: boolean;
  nodeColor?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoShapePickerControl = ShapePickerControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const ShapePickerBase = ({ label = 'Shape', ...props }: ShapePickerProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoShapePickerControl}
  />
);

const ShapePicker = ShapePickerBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default ShapePicker;
