import { useEffect, useRef } from 'react';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import ArchitectField from '~/components/Form/ArchitectField';
import DatePicker, {
  DATE_FORMATS,
  DATE_TYPES,
} from '~/components/Form/Fields/DatePicker';

import { parameterString, type ParameterValues } from './parameterValues';

const dateTypes = DATE_TYPES.map((type) => ({
  ...type,
  label: `${type.label} (${DATE_FORMATS[type.value].toUpperCase()})`,
}));

const DEFAULT_DATE_TYPE = 'full';

const asDateFormat = (type: unknown) =>
  typeof type === 'string' && type in DATE_FORMATS
    ? DATE_FORMATS[type as keyof typeof DATE_FORMATS]
    : DATE_FORMATS.full;

type DateTimeParametersProps = {
  name: string;
  initialParameters?: ParameterValues;
};

const DateTimeParameters = ({
  name,
  initialParameters,
}: DateTimeParametersProps) => {
  const typeField = `${name}.type`;
  const minField = `${name}.min`;
  const maxField = `${name}.max`;

  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const dateType = useFormStore(
    (state) => state.getFieldState(typeField)?.value,
  );

  // The range fields are typed against the chosen resolution, so changing it
  // invalidates whatever is already there. This replaces the field's old
  // `onChange` side effect: a caller `onChange` would replace the store write
  // and detach the field. The first value the field reports once registered is
  // recorded rather than acted on, so opening the editor never clears a
  // committed range.
  const previousType = useRef<unknown>(undefined);
  useEffect(() => {
    if (dateType === undefined) return;
    if (previousType.current === undefined) {
      previousType.current = dateType;
      return;
    }
    if (previousType.current === dateType) return;
    previousType.current = dateType;
    setFieldValue(minField, undefined);
    setFieldValue(maxField, undefined);
  }, [dateType, maxField, minField, setFieldValue]);

  const dateFormat = asDateFormat(dateType);
  const pickerParameters = {
    type: dateType,
    min: '1000-01-01',
    max: '3000-12-31',
  };

  return (
    <>
      <ArchitectField
        component={NativeSelectField}
        name={typeField}
        label="Date resolution"
        hint="Date resolution controls the precision of the measurement. By default, this input will ask for a year, a month, and a day. You may optionally choose to collect only a year and a month, or only a year."
        // Seeds the resolution the interview runtime assumes, so a variable
        // saved without touching this field still carries one.
        initialValue={
          parameterString(initialParameters?.type) ?? DEFAULT_DATE_TYPE
        }
        validation={{ required: true }}
        options={dateTypes}
      />
      <ArchitectField
        component={DatePicker}
        name={minField}
        label="Start range"
        hint="The earliest date available for the participant to select. If left empty, it will default to starting in the year 1920."
        initialValue={parameterString(initialParameters?.min)}
        validation={{ ISODate: dateFormat }}
        placeholder="Select a start range date..."
        parameters={pickerParameters}
      />
      <ArchitectField
        component={DatePicker}
        name={maxField}
        label="End range"
        hint="The latest date available for the participant to select. If it is not supplied, the input will default to ending at the current date."
        initialValue={parameterString(initialParameters?.max)}
        // Audit sweep: the schema only rejects `min > max`, so a collapsed
        // single-day window is legal — and it is the shape the contradiction
        // analyser reads as pinning the variable to one value. A strict
        // `greaterThan` here refused to author it.
        validation={{
          ISODate: dateFormat,
          greaterThanOrEqualTo: {
            value: minField,
            message: 'End date must not be before start date',
          },
        }}
        placeholder="Select an end range date, or leave empty to use interview date..."
        parameters={pickerParameters}
      />
    </>
  );
};

export default DateTimeParameters;
