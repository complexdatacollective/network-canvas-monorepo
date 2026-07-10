import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { ComponentProps, ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValues } from 'redux-form';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FrescoReduxField } from '~/components/Form';
import { DatePicker } from '~/components/Form/Fields';
import { DATE_FORMATS, DATE_TYPES } from '~/components/Form/Fields/DatePicker';
import ValidatedField from '~/components/Form/ValidatedField';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

const dateTypes = DATE_TYPES.map((type) => ({
  ...type,
  label: `${type.label} (${DATE_FORMATS[type.value].toUpperCase()})`,
}));
type DateTimeParametersProps = {
  name: string;
  type?: string;
  setSelectDefault: () => void;
  resetRangeFields: () => void;
};
const DateTimeParameters = ({
  name,
  type = 'full',
  setSelectDefault,
  resetRangeFields,
}: DateTimeParametersProps) => {
  const dateFormat = type
    ? DATE_FORMATS[type as keyof typeof DATE_FORMATS]
    : DATE_FORMATS.full;
  const [useDateFormat, setUseDateFormat] = useState(type);
  useEffect(() => {
    if (!type) {
      setSelectDefault();
    }
    setUseDateFormat(type);
  }, [type, setSelectDefault]);
  return (
    <>
      <Heading level="h4">Date Resolution</Heading>
      <Paragraph>
        Date resolution controls the precision of the measurement. By default,
        this input will ask for a year, a month, and a day. You may optionally
        choose to collect only a year and a month, or only a year.
      </Paragraph>
      <ValidatedField
        component={FrescoReduxField}
        name={`${name}.type`}
        validation={{ required: true }}
        label="Date resolution"
        componentProps={{
          fieldComponent: FrescoNativeSelectField,
          options: dateTypes,
        }}
        onChange={
          ((_, value) => {
            setUseDateFormat(value as string);
            resetRangeFields();
          }) as ComponentProps<typeof ValidatedField>['onChange']
        }
      />
      <br />
      <Heading level="h4">Start Range</Heading>
      <Paragraph>
        The start range is the earliest date available for the participant to
        select. If left empty, it will default to starting in the year 1920.
      </Paragraph>
      <ValidatedField
        component={DatePicker}
        name={`${name}.min`}
        validation={{ ISODate: dateFormat }}
        componentProps={{
          label: '',
          placeholder: 'Select a start range date...',
          parameters: {
            type: useDateFormat,
            min: '1000-01-01',
            max: '3000-12-31',
          },
        }}
      />
      <br />
      <Heading level="h4">End Range</Heading>
      <Paragraph>
        The end range is the latest date available for the participant to
        select. If it is not supplied, the input will default to ending at the
        current date.
      </Paragraph>
      <ValidatedField
        component={DatePicker}
        name={`${name}.max`}
        validation={{
          ISODate: dateFormat,
          greaterThan: {
            value: `${name}.min`,
            message: 'End date must be after start date',
          },
        }}
        componentProps={{
          label: '',
          placeholder:
            'Select an end range date, or leave empty to use interview date...',
          parameters: {
            type: useDateFormat,
            min: '1000-01-01',
            max: '3000-12-31',
          },
        }}
      />
    </>
  );
};
const mapDispatchToProps = (
  dispatch: Dispatch,
  {
    name,
    form,
  }: {
    name: string;
    form: string;
  },
) => ({
  setSelectDefault: () =>
    dispatch(change(form, `${name}.type`, 'full') as UnknownAction),
  resetRangeFields: () => {
    dispatch(change(form, `${name}.max`, null) as UnknownAction);
    dispatch(change(form, `${name}.min`, null) as UnknownAction);
  },
});
export default compose<
  ComponentProps<typeof DateTimeParameters>,
  typeof DateTimeParameters
>(
  connect(null, mapDispatchToProps),
  formValues({ type: 'parameters.type' }),
)(DateTimeParameters);
