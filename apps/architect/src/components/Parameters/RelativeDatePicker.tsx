import { useContext, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import ArchitectField from '~/components/Form/ArchitectField';
import DatePicker, { DATE_FORMATS } from '~/components/Form/Fields/DatePicker';

import {
  parameterInteger,
  parameterString,
  type ParameterValues,
} from './parameterValues';
const messages = defineMessages({
  optionUseInterviewDate: {
    id: 'architect.parameters.relativeDatePicker.useInterviewDate',
    defaultMessage: 'Use interview date',
    description:
      'The label text in components / Parameters / RelativeDatePicker.',
  },
  theAnchorDateDefinesThePoint: {
    id: 'architect.parameters.relativeDatePicker.theAnchorDateDefinesThePoint',
    defaultMessage:
      'The anchor date defines the point that the participant can select a date relative to. Using the interview date sets it dynamically based on when the interview is conducted; turn this off to specify a date manually.',
    description:
      'The hint text in components / Parameters / RelativeDatePicker.',
  },
  specificAnchorDate: {
    id: 'architect.parameters.relativeDatePicker.specificAnchorDate',
    defaultMessage: 'Specific Anchor Date',
    description:
      'The label text in components / Parameters / RelativeDatePicker.',
  },
  anchorDateMustUseAYear: {
    id: 'architect.parameters.relativeDatePicker.anchorDateMustUseAYear',
    defaultMessage: 'Anchor date must use a year of 0001 or later',
    description:
      'The message text in components / Parameters / RelativeDatePicker.',
  },
  daysBefore: {
    id: 'architect.parameters.relativeDatePicker.daysBefore',
    defaultMessage: 'Days before',
    description:
      'The label text in components / Parameters / RelativeDatePicker.',
  },
  theNumberOfDaysPriorTo: {
    id: 'architect.parameters.relativeDatePicker.theNumberOfDaysPriorTo',
    defaultMessage:
      'The number of days prior to the anchor date that can be selected from. Defaults to 180 days if left blank.',
    description:
      'The hint text in components / Parameters / RelativeDatePicker.',
  },
  daysAfter: {
    id: 'architect.parameters.relativeDatePicker.daysAfter',
    defaultMessage: 'Days after',
    description:
      'The label text in components / Parameters / RelativeDatePicker.',
  },
  theNumberOfDaysAfterThe: {
    id: 'architect.parameters.relativeDatePicker.theNumberOfDaysAfterThe',
    defaultMessage:
      'The number of days after the anchor date that can be selected from. Defaults to 0 days if left blank.',
    description:
      'The hint text in components / Parameters / RelativeDatePicker.',
  },
});

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
  const intl = useAppIntl();
  const anchorField = `${name}.anchor`;
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const storeApi = useContext(FormStoreContext);
  const initialAnchor = parameterString(initialParameters?.anchor);

  // `useInterviewDate` is a presentation choice, not a saved parameter: the
  // interview date is what an absent `anchor` means, so the toggle stays local
  // and unregistered rather than writing a key the schema does not carry.
  //
  // It is seeded from the STORE, not from the committed row, and only once per
  // mount:
  //
  // - Once per mount, because the researcher turns the toggle off precisely in
  //   order to type an anchor, and the anchor is empty for the whole interval
  //   between the toggle and the first keystroke. Deriving this value, or
  //   syncing it in an effect, would snap the toggle back on and unmount the
  //   input the researcher is typing into.
  // - From the store, because this editor is remounted whenever the variable's
  //   input control changes, and the observer that reacts to that change clears
  //   every `parameters.*` leaf (see `withFieldsHandlers`). By the remount the
  //   row prop still carries the committed anchor that no longer exists in the
  //   form, so seeding from it would show "use a specific date" with an empty —
  //   and REQUIRED — anchor input, refusing a save the researcher never broke.
  //
  // `getFieldState` reads dormant entries too, and the absence of an entry is
  // what distinguishes "never registered here" (fall back to the committed row)
  // from "registered or parked holding no anchor" (the cleared state).
  const [useInterviewDate, setUseInterviewDate] = useState(() => {
    const anchorState = storeApi?.getState().getFieldState(anchorField);
    return !parameterString(anchorState ? anchorState.value : initialAnchor);
  });

  return (
    <>
      <UnconnectedField
        name={`${name}.useInterviewDate`}
        label={intl.formatMessage(messages.optionUseInterviewDate)}
        hint={intl.formatMessage(messages.theAnchorDateDefinesThePoint)}
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
          label={intl.formatMessage(messages.specificAnchorDate)}
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
              message: intl.formatMessage(messages.anchorDateMustUseAYear),
            },
          }}
          parameters={{ min: '0001-01-01', max: '3000-01-01' }}
        />
      )}
      <ArchitectField
        label={intl.formatMessage(messages.daysBefore)}
        hint={intl.formatMessage(messages.theNumberOfDaysPriorTo)}
        component={DayOffsetField}
        name={`${name}.before`}
        initialValue={parameterInteger(initialParameters?.before)}
        validation={{ minValue: 0 }}
        placeholder={intl.formatNumber(180)}
      />
      <ArchitectField
        label={intl.formatMessage(messages.daysAfter)}
        hint={intl.formatMessage(messages.theNumberOfDaysAfterThe)}
        component={DayOffsetField}
        name={`${name}.after`}
        initialValue={parameterInteger(initialParameters?.after)}
        validation={{ minValue: 0 }}
        placeholder={intl.formatNumber(0)}
      />
    </>
  );
};

export default RelativeDatePickerParameters;
