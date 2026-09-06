import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { MAX_ZOOM, MIN_ZOOM } from './mapView.ts';

/**
 * `size` is dropped: on a native input it is a character width, and on
 * Fresco's it is a control scale. Forwarding one where the other is expected
 * is a type error at best and a mis-sized control at worst.
 */
export type MapZoomFieldProps = Omit<
  CreateFormFieldProps<number, 'input'>,
  'size'
>;

/**
 * How far the map is zoomed in when the stage opens.
 *
 * A number, held as a number. Fresco's text input reports what was typed —
 * which is a string, and a string is not a zoom level to the protocol schema —
 * so the reading is parsed here rather than at each place that stores one.
 * Text that is not a number at all clears the value instead of storing `NaN`,
 * which is how the field says "not answered" and how the schema spells it.
 */
export default function MapZoomField({
  value,
  onChange,
  ...inputProps
}: MapZoomFieldProps) {
  return (
    <InputField
      {...inputProps}
      type="number"
      min={MIN_ZOOM}
      max={MAX_ZOOM}
      step={1}
      // Named for the number they move. The shared field's default is
      // "Increase value", which is also what the two coordinate controls
      // beside this one would be called — three numbers describing one
      // starting view, six buttons a screen reader cannot tell apart.
      stepperLabels={{ increase: 'Increase zoom', decrease: 'Decrease zoom' }}
      value={
        typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
      }
      onChange={(next) => {
        if (next === undefined || next === '') {
          onChange?.(undefined);
          return;
        }
        const parsed = typeof next === 'number' ? next : Number(next);
        onChange?.(Number.isFinite(parsed) ? parsed : undefined);
      }}
    />
  );
}
