import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import DatePicker, { DATE_FORMATS } from '~/components/Form/Fields/DatePicker';
import Toggle from '~/components/Form/Fields/Toggle';
import FrescoReduxField, {
  reduxIntegerValue,
} from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import type { RootState } from '~/ducks/modules/root';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

type RelativeDatePickerParametersProps = {
  name: string;
  resetField: () => void;
  anchorValue?: string | null;
};
const RelativeDatePickerParameters = ({
  name,
  anchorValue = null,
  resetField,
}: RelativeDatePickerParametersProps) => {
  const dateFormat = DATE_FORMATS.full;
  const [useInterviewDate, setUseInterviewDate] = useState(!anchorValue);
  return (
    <>
      <Heading level="h4">Anchor Date</Heading>
      <Paragraph>
        The anchor date defines the point that the participant can select a date
        relative to. You can choose to either use the interview date, or specify
        a specific date manually. When using the interview date, the date will
        be set dynamically based on when your interview is conducted.
      </Paragraph>
      <Toggle
        input={{
          name: `${name}.useInterviewDate`,
          value: useInterviewDate,
          onChange: (checked: boolean) => {
            if (checked) {
              resetField();
            }
            setUseInterviewDate(checked);
          },
        }}
        label="Use interview date"
        fieldLabel=" "
      />
      {!useInterviewDate && (
        <ValidatedField
          label="Specific Anchor Date"
          component={DatePicker}
          name={`${name}.anchor`}
          // Audit sweep: the `min` below configures the picker's selectable
          // range; only a validation rule gates the committed value. Twenty-
          // first-wave Finding 4: the schema requires a year of 0100 or later
          // — fresco-ui's `addDays` runtime arithmetic (`Date.UTC`) only
          // two-digit-coerces a year in 0-99 onto 1900-1999, so 0100-0999
          // round-trip correctly and the floor is 0100, not 1000 — and without
          // a matching rule here the dialog saved and the protocol-validation
          // listener then threw a blocking invalid-protocol dialog offering to
          // revert the edit.
          validation={{
            required: !useInterviewDate,
            ISODate: dateFormat,
            minDate: {
              value: '0100-01-01',
              message:
                'Anchor date must use a year of 0100 or later — Date.UTC maps years 0-99 onto 1900-1999',
            },
          }}
          componentProps={{
            parameters: {
              min: '0100-01-01',
              max: '3000-01-01',
            },
          }}
        />
      )}
      <Heading level="h4">Days Before</Heading>
      <Paragraph>
        Days before is the number of days prior to the anchor date that can be
        selected from. Defaults to 180 days if left blank.
      </Paragraph>
      <ValidatedField
        label="Days before"
        component={FrescoReduxField}
        name={`${name}.before`}
        validation={{ minValue: 0 }}
        componentProps={{
          placeholder: '180',
          fieldComponent: FrescoInputField,
          type: 'number',
          min: 0,
          ...reduxIntegerValue,
        }}
      />
      <Heading level="h4">Days After</Heading>
      <Paragraph>
        Days after is the number of days after the anchor date that can be
        selected from. Defaults to 0 days if left blank.
      </Paragraph>
      <ValidatedField
        label="Days after"
        component={FrescoReduxField}
        name={`${name}.after`}
        validation={{ minValue: 0 }}
        componentProps={{
          placeholder: '0',
          fieldComponent: FrescoInputField,
          type: 'number',
          min: 0,
          ...reduxIntegerValue,
        }}
      />
    </>
  );
};
type ConnectProps = {
  name: string;
  form: string;
};
const mapStateToProps = (state: RootState, { name, form }: ConnectProps) => ({
  anchorValue: formValueSelector(form)(state, `${name}.anchor`),
});
const mapDispatchToProps = (
  dispatch: Dispatch,
  { name, form }: ConnectProps,
) => ({
  resetField: () =>
    dispatch(change(form, `${name}.anchor`, null) as UnknownAction),
});
export default compose<RelativeDatePickerParametersProps, ConnectProps>(
  connect(mapStateToProps, mapDispatchToProps),
)(RelativeDatePickerParameters);
