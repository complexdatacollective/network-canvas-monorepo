import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';

import { parameterString, type ParameterValues } from './parameterValues';

type ScalarParametersProps = {
  name: string;
  initialParameters?: ParameterValues;
};

const ScalarParameters = ({
  name,
  initialParameters,
}: ScalarParametersProps) => (
  <>
    {/* Describes the pair of fields below, so it stays section body text
        rather than moving into either field's hint. */}
    <Paragraph>
      This input type requires you to specify a <strong>minimum</strong> and{' '}
      <strong>maximum</strong> label, which will be displayed at each end of the
      scale.
    </Paragraph>
    <ArchitectField
      label="Minimum label"
      component={InputField}
      name={`${name}.minLabel`}
      initialValue={parameterString(initialParameters?.minLabel)}
      validation={{ required: true }}
    />
    <ArchitectField
      label="Maximum label"
      component={InputField}
      name={`${name}.maxLabel`}
      initialValue={parameterString(initialParameters?.maxLabel)}
      validation={{ required: true }}
    />
  </>
);

export default ScalarParameters;
