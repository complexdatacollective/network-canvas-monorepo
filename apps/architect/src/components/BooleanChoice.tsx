import { compose } from '@reduxjs/toolkit';
import { isEmpty, isNull } from 'es-toolkit/compat';
import { useEffect } from 'react';
import { connect } from 'react-redux';
import { change, Field, formValueSelector } from 'redux-form';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import RichText from '~/components/Form/Fields/RichText/Field';
import Toggle from '~/components/Form/Fields/Toggle';

import ValidatedField from './Form/ValidatedField';
type OptionType = {
  label: string;
  value: boolean;
  negative?: boolean;
};
type OptionsProps = {
  form: string;
  formSelector: (variable: string) => unknown;
  changeField: (form: string, field: string, value: unknown) => void;
};
type RootState = Record<string, unknown>;
const mapStateToProps = (
  state: RootState,
  {
    form,
  }: {
    form: string;
  },
) => {
  const selector = formValueSelector(form);
  const formSelector = (variable: string) => selector(state, variable);
  return {
    formSelector,
  };
};
const mapDispatchToProps = {
  changeField: change,
};
const initialValues: OptionType[] = [
  { label: 'Yes', value: true },
  { label: 'No', value: false, negative: true },
];
const Options = compose(connect(mapStateToProps, mapDispatchToProps))(({
  form,
  formSelector,
  changeField,
}: OptionsProps) => {
  useEffect(() => {
    const currentOptions = formSelector('options');
    if (isNull(currentOptions) || isEmpty(currentOptions)) {
      changeField(form, 'options', initialValues);
    }
  }, [form, formSelector, changeField]);
  return (
    <div>
      <Paragraph>
        The BooleanChoice input component allows you to specify rich text labels
        for the two choices that your participant sees. Create a label for the
        first option, representing the value true, and the second option,
        representing the value false, below.
      </Paragraph>
      <Paragraph>
        Each value can also be styled to indicate that it is negative. When
        enabled, this will make the option red when selected, and use a cross
        icon rather than a tick.
      </Paragraph>
      <div className="grid grid-cols-2 gap-x-5">
        <div className="bg-surface-3 rounded p-7 [&_h3]:mt-0">
          <Heading level="h3">Option One</Heading>
          <Paragraph>
            This option will set the value <strong>true</strong> when selected.
          </Paragraph>
          <ValidatedField
            component={RichText}
            name="options[0].label"
            validation={{ required: true }}
            componentProps={{
              label: 'Label',
              disallowedTypes: ['history', 'quote'],
            }}
          />
          <Field
            label="Style option as negative"
            component={Toggle}
            name="options[0].negative"
          />
        </div>
        <div className="bg-surface-3 rounded p-7 [&_h3]:mt-0">
          <Heading level="h3">Option Two</Heading>
          <Paragraph>
            This option will set the value <strong>false</strong> when selected.
          </Paragraph>
          <ValidatedField
            component={RichText}
            name="options[1].label"
            validation={{ required: true }}
            componentProps={{
              label: 'Label',
              disallowedTypes: ['history', 'quote'],
            }}
          />
          <Field
            label="Style option as negative"
            component={Toggle}
            name="options[1].negative"
          />
        </div>
      </div>
    </div>
  );
});
export default Options;
