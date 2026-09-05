import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';

import { parameterString, type ParameterValues } from './parameterValues';
const messages = defineMessages({
  thisInputTypeRequiresYouTo: {
    id: 'architect.parameters.scalar.thisInputTypeRequiresYouTo',
    defaultMessage:
      'This input type requires you to specify a <strong>minimum</strong> and <strong2>maximum</strong2> label, which will be displayed at each end of the scale.',
    description: 'Visible text in components / Parameters / Scalar.',
  },
  minimumLabel: {
    id: 'architect.parameters.scalar.minimumLabel',
    defaultMessage: 'Minimum label',
    description: 'The label text in components / Parameters / Scalar.',
  },
  maximumLabel: {
    id: 'architect.parameters.scalar.maximumLabel',
    defaultMessage: 'Maximum label',
    description: 'The label text in components / Parameters / Scalar.',
  },
});

type ScalarParametersProps = {
  name: string;
  initialParameters?: ParameterValues;
};

const ScalarParameters = ({
  name,
  initialParameters,
}: ScalarParametersProps) => {
  const intl = useAppIntl();
  return (
    <>
      {/* Describes the pair of fields below, so it stays section body text
        rather than moving into either field's hint. */}
      <Paragraph>
        {intl.formatMessage(messages.thisInputTypeRequiresYouTo, {
          strong: (chunks) => <strong>{chunks}</strong>,
          strong2: (chunks) => <strong>{chunks}</strong>,
        })}
      </Paragraph>
      <ArchitectField
        label={intl.formatMessage(messages.minimumLabel)}
        component={InputField}
        name={`${name}.minLabel`}
        initialValue={parameterString(initialParameters?.minLabel)}
        validation={{ required: true }}
      />
      <ArchitectField
        label={intl.formatMessage(messages.maximumLabel)}
        component={InputField}
        name={`${name}.maxLabel`}
        initialValue={parameterString(initialParameters?.maxLabel)}
        validation={{ required: true }}
      />
    </>
  );
};

export default ScalarParameters;
