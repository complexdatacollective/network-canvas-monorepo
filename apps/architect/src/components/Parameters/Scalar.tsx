import type { ComponentType } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { FrescoReduxField, ValidatedField } from '../Form';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

type ScalarParametersProps = {
  name: string;
};
const ScalarParameters = ({ name }: ScalarParametersProps) => (
  <>
    <Paragraph>
      This input type requires you to specify a <strong>minimum</strong> and{' '}
      <strong>maximum</strong> label, which will be displayed at each end of the
      scale.
    </Paragraph>
    <ValidatedField
      label="Minimum label"
      component={FrescoReduxField}
      name={`${name}.minLabel`}
      validation={{ required: true }}
      componentProps={{ fieldComponent: FrescoInputField }}
    />
    <ValidatedField
      label="Maximum label"
      component={FrescoReduxField}
      name={`${name}.maxLabel`}
      validation={{ required: true }}
      componentProps={{ fieldComponent: FrescoInputField }}
    />
  </>
);
export default ScalarParameters;
