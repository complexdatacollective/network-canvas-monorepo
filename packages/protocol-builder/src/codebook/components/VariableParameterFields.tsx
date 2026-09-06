import { type ComponentType, useState } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

import {
  DATE_RESOLUTION_OPTIONS,
  dateResolutionOf,
  type ParameterIssues,
  type ParameterShape,
  readParameters,
} from '../variableParameters.ts';

const DatePickerControl = DatePickerField as ComponentType<
  Record<string, unknown>
>;
const InputControl = InputField as ComponentType<Record<string, unknown>>;
const SelectControl = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

export type VariableParameterFieldsProps = Readonly<{
  shape: ParameterShape;
  /** The block as the draft holds it, which may be anything until it saves. */
  parameters: unknown;
  /** Replaces one setting. `undefined` clears it. */
  onChange(key: string, value: unknown): void;
  issues: ParameterIssues;
  readOnly: boolean;
}>;

/**
 * The settings the chosen input control takes.
 *
 * Which settings those are is the control's business, not the attribute's —
 * see `parameterShapeFor` — so this renders one of three sets and nothing in
 * between. Each control writes a single key, and the editor around it decides
 * what reaches the protocol, so a set swapped out mid-edit leaves nothing of
 * the old one behind.
 *
 * The counterpart of Architect's `Parameters` and the three editors under it,
 * with one deliberate difference: there is no "use the interview date" switch
 * in front of the anchor. An absent anchor already MEANS the date of the
 * interview, so the switch was a second way of saying what an empty field says,
 * and a hidden piece of state that had to be kept in step with the field it
 * hid. The hint says it instead.
 */
export default function VariableParameterFields({
  shape,
  parameters,
  onChange,
  issues,
  readOnly,
}: VariableParameterFieldsProps) {
  const held = readParameters(parameters);
  // Changing the resolution takes the two bounds away, which is right and must
  // not be silent: the hint says it will happen, and this says that it has.
  const [clearedBounds, setClearedBounds] = useState(false);
  const errorsFor = (key: string): string[] => [...(issues[key] ?? [])];
  const fieldProps = (key: string) => {
    const errors = errorsFor(key);
    return {
      readOnly,
      errors,
      showErrors: errors.length > 0,
    };
  };

  if (shape === 'scalar') {
    return (
      <>
        <UnconnectedField
          name="parameter-min-label"
          label="Minimum label"
          hint="Shown at the low end of the scale, so the participant knows what the two ends mean."
          component={InputControl}
          placeholder="Not at all close"
          value={asText(held.minLabel)}
          onChange={(value: unknown) => onChange('minLabel', value)}
          required
          {...fieldProps('minLabel')}
        />
        <UnconnectedField
          name="parameter-max-label"
          label="Maximum label"
          hint="Shown at the high end of the scale."
          component={InputControl}
          placeholder="Extremely close"
          value={asText(held.maxLabel)}
          onChange={(value: unknown) => onChange('maxLabel', value)}
          required
          {...fieldProps('maxLabel')}
        />
      </>
    );
  }

  if (shape === 'relativeDatePicker') {
    return (
      <>
        <UnconnectedField
          name="parameter-anchor"
          label="Anchor date"
          hint="The date the window is measured from. Leave it empty to measure from the date of the interview."
          component={DatePickerControl}
          type="full"
          value={asText(held.anchor)}
          onChange={(value: unknown) =>
            onChange('anchor', emptyToUndefined(value))
          }
          {...fieldProps('anchor')}
        />
        <UnconnectedField
          name="parameter-before"
          label="Days before"
          hint={`How far back from the anchor the participant can choose. Left empty, ${RELATIVE_DATE_PICKER_DEFAULT_BEFORE} days.`}
          component={InputControl}
          type="number"
          min={0}
          placeholder={String(RELATIVE_DATE_PICKER_DEFAULT_BEFORE)}
          value={asDayCount(held.before)}
          onChange={(value: unknown) => onChange('before', asWholeDays(value))}
          {...fieldProps('before')}
        />
        <UnconnectedField
          name="parameter-after"
          label="Days after"
          hint={`How far forward from the anchor the participant can choose. Left empty, ${RELATIVE_DATE_PICKER_DEFAULT_AFTER} days.`}
          component={InputControl}
          type="number"
          min={0}
          placeholder={String(RELATIVE_DATE_PICKER_DEFAULT_AFTER)}
          value={asDayCount(held.after)}
          onChange={(value: unknown) => onChange('after', asWholeDays(value))}
          {...fieldProps('after')}
        />
      </>
    );
  }

  const resolution = dateResolutionOf(held);

  return (
    <>
      <UnconnectedField
        name="parameter-resolution"
        label="Date resolution"
        hint="How precise a date this field collects. Changing it clears the earliest and latest dates, because those are stored at the resolution chosen here."
        component={SelectControl}
        options={DATE_RESOLUTION_OPTIONS}
        value={resolution}
        onChange={(value: unknown) => {
          setClearedBounds(
            value !== resolution &&
              (asText(held.min) !== '' || asText(held.max) !== ''),
          );
          onChange('type', value);
        }}
        required
        {...fieldProps('type')}
      />
      {/* Always mounted, so a screen reader is watching this region before the
          notice appears: a live region added to the page at the same moment as
          its own content is not reliably announced. */}
      <div role="status" aria-live="polite">
        {clearedBounds && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              The earliest and latest dates were cleared, because they were set
              at the previous resolution. Set them again if you still need them.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <UnconnectedField
        name="parameter-min"
        label="Earliest date"
        hint="The earliest date the participant can choose. Left empty, the picker starts in 1920."
        component={DatePickerControl}
        type={resolution}
        value={asText(held.min)}
        onChange={(value: unknown) => {
          setClearedBounds(false);
          onChange('min', emptyToUndefined(value));
        }}
        {...fieldProps('min')}
      />
      <UnconnectedField
        name="parameter-max"
        label="Latest date"
        hint="The latest date the participant can choose. Left empty, the picker ends on the date of the interview."
        component={DatePickerControl}
        type={resolution}
        value={asText(held.max)}
        onChange={(value: unknown) => {
          setClearedBounds(false);
          onChange('max', emptyToUndefined(value));
        }}
        {...fieldProps('max')}
      />
    </>
  );
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** A number input reports its value as text, and holds nothing as `''`. */
const asDayCount = (value: unknown): string =>
  typeof value === 'number' ? String(value) : asText(value);

const emptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

/**
 * A day offset as the schema holds it: a whole number, or nothing at all.
 *
 * Parsed on the way in so the field never commits `"7"` where the schema
 * expects `7`, and so an emptied input clears the setting rather than storing
 * an empty string. A part-typed `-` or `1.5` clears it too: the schema refuses
 * both, and there is nothing to be gained by carrying a value that cannot be
 * saved through to the save.
 */
const asWholeDays = (value: unknown): number | undefined => {
  if (typeof value === 'number')
    return Number.isInteger(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};
