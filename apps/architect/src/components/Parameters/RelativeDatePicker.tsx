import { useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import DatePicker, { DATE_FORMATS } from '~/components/Form/Fields/DatePicker';
import ArchitectField from '~/components/Form/ArchitectField';

import {
  parameterInteger,
  parameterString,
  type ParameterValues,
} from './parameterValues';

type DayOffsetFieldProps = CreateFormFieldProps<
  number,
  'input',
  {
    placeholder?: string;
    // Narrows the `size` an <input> would otherwise contribute (a number) to
    // the control-size scale `InputField` expects.
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }
>;

/**
 * Day offsets are stored as numbers, but a number input reports its value as a
 * string. This parses on the way in and formats on the way out so the field
 * never commits `"7"` where the schema expects `7`; an emptied input clears the
 * parameter rather than storing an empty string.
 */
const DayOffsetField = ({ value, onChange, ...props }: DayOffsetFieldProps) => (
  <InputField
    {...props}
    type="number"
    min={0}
    value={value === undefined ? '' : String(value)}
    onChange={(nextValue) => {
      const parsed = Number(nextValue);
      onChange?.(
        typeof nextValue === 'string' &&
          nextValue.trim() !== '' &&
          Number.isInteger(parsed)
          ? parsed
          : undefined,
      );
    }}
  />
);

type RelativeDatePickerParametersProps = {
  name: string;
  initialParameters?: ParameterValues;
};

const RelativeDatePickerParameters = ({
  name,
  initialParameters,
}: RelativeDatePickerParametersProps) => {
  const anchorField = `${name}.anchor`;
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const initialAnchor = parameterString(initialParameters?.anchor);

  // `useInterviewDate` is a presentation choice, not a saved parameter: the
  // interview date is what an absent `anchor` means, so the toggle stays local
  // and unregistered rather than writing a key the schema does not carry.
  const [useInterviewDate, setUseInterviewDate] = useState(!initialAnchor);

  return (
    <>
      <UnconnectedField
        name={`${name}.useInterviewDate`}
        label="Use interview date"
        hint="The anchor date defines the point that the participant can select a date relative to. Using the interview date sets it dynamically based on when the interview is conducted; turn this off to specify a date manually."
        inline
        component={ToggleField}
        value={useInterviewDate}
        onChange={(checked) => {
          if (checked) setFieldValue(anchorField, undefined);
          setUseInterviewDate(Boolean(checked));
        }}
      />
      {!useInterviewDate && (
        <ArchitectField
          label="Specific Anchor Date"
          component={DatePicker}
          name={anchorField}
          initialValue={initialAnchor}
          // The picker boundary and validation rule must match the schema's
          // earliest full date so the editor cannot commit an invalid anchor.
          validation={{
            required: true,
            ISODate: DATE_FORMATS.full,
            minDate: {
              value: '0001-01-01',
              message: 'Anchor date must use a year of 0001 or later',
            },
          }}
          parameters={{ min: '0001-01-01', max: '3000-01-01' }}
        />
      )}
      <ArchitectField
        label="Days before"
        hint="The number of days prior to the anchor date that can be selected from. Defaults to 180 days if left blank."
        component={DayOffsetField}
        name={`${name}.before`}
        initialValue={parameterInteger(initialParameters?.before)}
        validation={{ minValue: 0 }}
        placeholder="180"
      />
      <ArchitectField
        label="Days after"
        hint="The number of days after the anchor date that can be selected from. Defaults to 0 days if left blank."
        component={DayOffsetField}
        name={`${name}.after`}
        initialValue={parameterInteger(initialParameters?.after)}
        validation={{ minValue: 0 }}
        placeholder="0"
      />
    </>
  );
};

export default RelativeDatePickerParameters;
