import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { shapeOptions } from '../codebook/shapeMapping.ts';

const messages = defineMessages({
  selectShape: {
    id: 'protocolBuilder.shapePicker.selectShape',
    defaultMessage: 'Select shape {value1}',
    description:
      'Accessible name of one swatch of the node-shape picker, where {value1} is the shape’s own name — “Select shape Circle”. A node is a member of the interview network.',
  },
});

const isNodeShape = (value: unknown): value is NodeShape =>
  value === 'circle' || value === 'square' || value === 'diamond';

export type ShapePickerFieldProps = CreateFormFieldProps<
  NodeShape,
  'fieldset',
  {
    /** Compact swatches for an inline mapping row: no labels, no chrome. */
    small?: boolean;
    /** The type's own colour, so a swatch is drawn as the node will be. */
    nodeColor?: string;
    /**
     * Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and says the same thing through `aria-required`.
     */
    required?: boolean;
  }
>;

/**
 * Which shape a node type is drawn as, chosen from the shapes themselves.
 *
 * Architect's own control (`components/TypeEditor/ShapePicker.tsx`): a radio
 * group of node swatches tinted with the type's live colour, so the researcher
 * chooses by looking at what the participant will see rather than by reading
 * the word for it. Used for the type's default shape and for every row of its
 * shape mapping, which are the same question asked about different values.
 *
 * Labelling belongs to the surrounding field — `UnconnectedField`'s
 * `label`/`hint`, or `aria-label` where the row above carries the words.
 */
export default function ShapePickerField({
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
}: ShapePickerFieldProps) {
  const intl = useAppIntl();

  return (
    <RadioGroup
      id={id}
      name={name}
      value={value ?? ''}
      onValueChange={(next) => {
        if (!readOnly && isNodeShape(next)) onChange?.(next);
      }}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-label={ariaLabel}
      aria-labelledby={
        ariaLabel === undefined
          ? (ariaLabelledBy ?? (id === undefined ? undefined : `${id}-label`))
          : undefined
      }
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid === true ? true : undefined}
      aria-required={ariaRequired === true || required ? true : undefined}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx(
        'flex flex-wrap gap-3 rounded border-2',
        !small && 'bg-input text-input-contrast p-4',
        ariaInvalid === true && 'border-destructive',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
      )}
    >
      {shapeOptions(intl).map((shape) => (
        <Radio.Root
          key={shape.value}
          value={shape.value}
          nativeButton
          render={(
            // `Node`'s own `onDragStart`/`onDragEnd` are pointer-gesture props
            // rather than the HTML5 drag events the generic bag carries, so
            // those must not be spread into them.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            { onDrag, onDragStart, onDragEnd, ...renderProps },
            state,
          ) => (
            <Node
              {...renderProps}
              label={small ? '' : shape.label}
              ariaLabel={intl.formatMessage(messages.selectShape, {
                value1: shape.label,
              })}
              shape={shape.value}
              color={nodeColor as NodeColorSequence}
              size={small ? 'xs' : 'sm'}
              selected={state.checked}
            />
          )}
        />
      ))}
    </RadioGroup>
  );
}
