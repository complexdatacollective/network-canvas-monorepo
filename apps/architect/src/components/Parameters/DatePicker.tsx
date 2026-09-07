import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import ArchitectField from '~/components/Form/ArchitectField';
import DatePicker, {
  DATE_FORMATS,
  DATE_TYPES,
} from '~/components/Form/Fields/DatePicker';
import { formatConfig } from '~/i18n/formatConfig';

import { parameterString, type ParameterValues } from './parameterValues';
const chromeMessages = defineMessages({
  message: {
    id: 'architect.chrome.parameters.datePicker.message',
    defaultMessage: '{value1} ({value2})',
    description: 'The label text in components / Parameters / DatePicker.',
  },
});
const messages = defineMessages({
  dateResolution: {
    id: 'architect.parameters.datePicker.dateResolution',
    defaultMessage: 'Date resolution',
    description: 'The label text in components / Parameters / DatePicker.',
  },
  dateResolutionControlsThePrecisionOf: {
    id: 'architect.parameters.datePicker.dateResolutionControlsThePrecisionOf',
    defaultMessage:
      'Date resolution controls the precision of the measurement. By default, this input will ask for a year, a month, and a day. You may optionally choose to collect only a year and a month, or only a year. Changing the resolution clears the start and end range, because those dates are stored at the resolution you choose here.',
    description: 'The hint text in components / Parameters / DatePicker.',
  },
  theStartAndEndRangeWere: {
    id: 'architect.parameters.datePicker.theStartAndEndRangeWere',
    defaultMessage:
      'The start and end range were cleared because they were set at the previous date resolution. Set them again if you still need them.',
    description: 'Visible text in components / Parameters / DatePicker.',
  },
  startRange: {
    id: 'architect.parameters.datePicker.startRange',
    defaultMessage: 'Start range',
    description: 'The label text in components / Parameters / DatePicker.',
  },
  theEarliestDateAvailableForThe: {
    id: 'architect.parameters.datePicker.theEarliestDateAvailableForThe',
    defaultMessage:
      'The earliest date available for the participant to select. If left empty, it will default to starting in the year 1920.',
    description: 'The hint text in components / Parameters / DatePicker.',
  },
  selectAStartRangeDate: {
    id: 'architect.parameters.datePicker.selectAStartRangeDate',
    defaultMessage: 'Select a start range date...',
    description:
      'The placeholder text in components / Parameters / DatePicker.',
  },
  endRange: {
    id: 'architect.parameters.datePicker.endRange',
    defaultMessage: 'End range',
    description: 'The label text in components / Parameters / DatePicker.',
  },
  theLatestDateAvailableForThe: {
    id: 'architect.parameters.datePicker.theLatestDateAvailableForThe',
    defaultMessage:
      'The latest date available for the participant to select. If it is not supplied, the input will default to ending at the current date.',
    description: 'The hint text in components / Parameters / DatePicker.',
  },
  endDateMustNotBeBefore: {
    id: 'architect.parameters.datePicker.endDateMustNotBeBefore',
    defaultMessage: 'End date must not be before start date',
    description: 'The message text in components / Parameters / DatePicker.',
  },
  selectAnEndRangeDateOr: {
    id: 'architect.parameters.datePicker.selectAnEndRangeDateOr',
    defaultMessage:
      'Select an end range date, or leave empty to use interview date...',
    description:
      'The placeholder text in components / Parameters / DatePicker.',
  },
});

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
  const intl = useAppIntl();
  const dateTypes = formatConfig(DATE_TYPES, intl).map((type) => ({
    ...type,
    label: intl.formatMessage(chromeMessages.message, {
      value1: type.label,
      value2: DATE_FORMATS[type.value].toUpperCase(),
    }),
  }));
  const typeField = `${name}.type`;
  const minField = `${name}.min`;
  const maxField = `${name}.max`;

  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const dateType = useFormStore(
    (state) => state.getFieldState(typeField)?.value,
  );
  const typeRegistered = useFormStore((state) => state.fields.has(typeField));

  // Re-seeds the default resolution after something else has emptied it.
  //
  // The field's own `initialValue` only applies at registration, and the
  // observer that reacts to an input-control change clears every
  // `parameters.*` leaf — including the one this section has just registered,
  // because React flushes a child's effects before its parent's. Choosing
  // DatePicker from another control therefore lands on a REQUIRED resolution
  // with no value and no visible default, and the field editor cannot be
  // saved. Watching for the empty value (rather than seeding once on mount)
  // also covers an undo/redo restore that drops the key.
  useEffect(() => {
    if (!typeRegistered || dateType !== undefined) return;
    setFieldValue(typeField, DEFAULT_DATE_TYPE);
  }, [dateType, setFieldValue, typeField, typeRegistered]);

  // The range fields are typed against the chosen resolution, so changing it
  // invalidates whatever is already there. This replaces the field's old
  // `onChange` side effect: a caller `onChange` would replace the store write
  // and detach the field. The first value the field reports once registered is
  // recorded rather than acted on, so opening the editor never clears a
  // committed range.
  //
  // Clearing them is correct — a full-resolution date is not a year, and
  // re-deriving one would quietly widen a window the researcher chose
  // deliberately — but it must not be silent, which is what it used to be. The
  // hint below says it will happen; `clearedRange` says that it just did, in a
  // live region, and only when there was something to clear.
  const minValue = useFormStore(
    (state) => state.getFieldState(minField)?.value,
  );
  const maxValue = useFormStore(
    (state) => state.getFieldState(maxField)?.value,
  );
  const rangeRef = useRef({ min: minValue, max: maxValue });
  rangeRef.current = { min: minValue, max: maxValue };
  const [clearedRange, setClearedRange] = useState(false);

  const previousType = useRef<unknown>(undefined);
  useEffect(() => {
    if (dateType === undefined) return;
    if (previousType.current === undefined) {
      previousType.current = dateType;
      return;
    }
    if (previousType.current === dateType) return;
    previousType.current = dateType;
    const { min, max } = rangeRef.current;
    setClearedRange(Boolean(min) || Boolean(max));
    setFieldValue(minField, undefined);
    setFieldValue(maxField, undefined);
  }, [dateType, maxField, minField, setFieldValue]);

  // The notice has served its purpose once a bound is set again.
  useEffect(() => {
    if (minValue || maxValue) setClearedRange(false);
  }, [minValue, maxValue]);

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
        label={intl.formatMessage(messages.dateResolution)}
        hint={intl.formatMessage(messages.dateResolutionControlsThePrecisionOf)}
        // Seeds the resolution the interview runtime assumes, so a variable
        // saved without touching this field still carries one.
        initialValue={
          parameterString(initialParameters?.type) ?? DEFAULT_DATE_TYPE
        }
        validation={{ required: true }}
        options={dateTypes}
      />
      {/* Always mounted so a screen reader is watching it before the notice
          appears — a live region added to the page at the same moment as its
          own content is not reliably announced. */}
      <div role="status" aria-live="polite">
        {clearedRange && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              {intl.formatMessage(messages.theStartAndEndRangeWere)}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <ArchitectField
        component={DatePicker}
        name={minField}
        label={intl.formatMessage(messages.startRange)}
        hint={intl.formatMessage(messages.theEarliestDateAvailableForThe)}
        initialValue={parameterString(initialParameters?.min)}
        validation={{ ISODate: dateFormat }}
        placeholder={intl.formatMessage(messages.selectAStartRangeDate)}
        parameters={pickerParameters}
      />
      <ArchitectField
        component={DatePicker}
        name={maxField}
        label={intl.formatMessage(messages.endRange)}
        hint={intl.formatMessage(messages.theLatestDateAvailableForThe)}
        initialValue={parameterString(initialParameters?.max)}
        // Audit sweep: the schema only rejects `min > max`, so a collapsed
        // single-day window is legal — and it is the shape the contradiction
        // analyser reads as pinning the variable to one value. A strict
        // `greaterThan` here refused to author it.
        validation={{
          ISODate: dateFormat,
          greaterThanOrEqualTo: {
            value: minField,
            message: intl.formatMessage(messages.endDateMustNotBeBefore),
          },
        }}
        placeholder={intl.formatMessage(messages.selectAnEndRangeDateOr)}
        parameters={pickerParameters}
      />
    </>
  );
};

export default DateTimeParameters;
