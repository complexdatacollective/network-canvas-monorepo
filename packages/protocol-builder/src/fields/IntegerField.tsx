import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

/**
 * `size` is dropped: the native `<input>`'s `size` attribute (a character
 * width) collides with `InputField`'s own `size` prop (a CVA variant) once the
 * rest is spread onto it, and nothing here ever sets either.
 */
export type IntegerFieldProps = Omit<
  CreateFormFieldProps<number, 'input'>,
  'size'
>;

/**
 * A whole number, held in the document as a number.
 *
 * `InputField` is string-valued — it emits `e.target.value` verbatim even for
 * `type="number"` — so a stage counting people would otherwise store `"3"` and
 * be refused by the schema in its own words. Presenting the number/undefined
 * pair here means every section that counts something spells it the same way,
 * and an emptied control clears the key rather than parking `""` on it.
 */
export function IntegerFieldControl({
  value,
  onChange,
  ...rest
}: IntegerFieldProps) {
  return (
    <InputField
      {...rest}
      type="number"
      value={value === undefined ? '' : String(value)}
      onChange={(next: string | undefined) => {
        if (next === undefined || next.trim() === '') {
          onChange?.(undefined);
          return;
        }
        const parsed = Number(next);
        // A part-typed number ("-", "1e") is not yet an answer. Reporting it
        // as `undefined` keeps the document free of `NaN`, which no schema
        // accepts and no message can explain.
        onChange?.(Number.isInteger(parsed) ? parsed : undefined);
      }}
    />
  );
}
